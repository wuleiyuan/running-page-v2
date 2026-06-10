"""
Apple Health export.xml → records 表（健康指标同步）

跟 apple_health_xml_sync.py 平行，那个只搞 workout，这个只搞 Record（HR/步数/睡眠/HRV/...）。

两阶段扫描：
  Pass 1: 统计 xml 里所有 Record type + 时间范围（10 秒）
  Pass 2: 流式解析选中的 Record type，按 (record_type, start_date, source_name) 唯一入库

数据源：~/Downloads/apple_health_export/导出.xml
目标：run_page/data.db 的 records 表

默认 sync 的 Record types（Phase 1 核心健康指标）：
  HeartRate                  455K 条  bpm
  StepCount                  655K 条  count
  SleepAnalysis               17K 条  category (InBed/AsleepCore/AsleepDeep/AsleepREM/Awake)
  HeartRateVariabilitySDNN    3.3K 条  ms (HRV)
  RestingHeartRate              549   bpm (RHR)

环境变量：
  APPLE_HEALTH_XML_PATH       默认 ~/Downloads/apple_health_export/导出.xml
  HEALTH_BATCH_SIZE           默认 5000
"""

import argparse
import datetime as dt
import os
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config import SQL_FILE  # noqa: E402
from generator.db import init_db, Record  # noqa: E402

# Apple HealthKit Record type → (短名, 单位)
# Phase 1: 5 个核心
DEFAULT_RECORD_TYPES = {
    "HKQuantityTypeIdentifierHeartRate": ("HeartRate", "bpm"),
    "HKQuantityTypeIdentifierStepCount": ("StepCount", "count"),
    "HKCategoryTypeIdentifierSleepAnalysis": ("SleepAnalysis", "category"),
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": ("HRV", "ms"),
    "HKQuantityTypeIdentifierRestingHeartRate": ("RestingHeartRate", "bpm"),
}

# SleepAnalysis value → category 短名
SLEEP_VALUE_MAP = {
    "HKCategoryValueSleepAnalysisInBed": "InBed",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "AsleepUnspec",
    "HKCategoryValueSleepAnalysisAsleepCore": "AsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep": "AsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM": "AsleepREM",
    "HKCategoryValueSleepAnalysisAwake": "Awake",
}


def parse_iso(date_str):
    """Apple Health 日期格式: '2026-06-09 19:06:23 +0800'"""
    if not date_str:
        return None
    try:
        return dt.datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        return None


def scan_xml_types(xml_path):
    """Pass 1: 扫描 xml 看有哪些 Record type（不读 Workout），返回 dict {hk_type: count}"""
    print(f"📂 Pass 1: 扫 {xml_path} 统计 Record 类型 ...")
    type_counts = {}
    total = 0
    for event, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag == "Record":
            total += 1
            rt = elem.attrib.get("type", "")
            type_counts[rt] = type_counts.get(rt, 0) + 1
        elem.clear()
    print(f"   总计 {total} 条 Record，{len(type_counts)} 个不同 type")
    return type_counts


def sync_records(xml_path, target_types, batch_size=5000, dry_run=False):
    """Pass 2: 流式 sync 选中的 Record 类型到 db"""
    print(f"\n📂 Pass 2: 同步 {len(target_types)} 个 Record 类型 ...")

    if not dry_run:
        session = init_db(str(SQL_FILE))
    else:
        # dry-run 用内存 db
        import tempfile
        db_path = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
        session = init_db(db_path)

    inserted = 0
    skipped = 0
    errors = 0
    buffer = []
    t0 = time.time()

    for event, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag != "Record":
            elem.clear()
            continue
        rt = elem.attrib.get("type", "")
        if rt not in target_types:
            elem.clear()
            continue

        try:
            short_name, unit = target_types[rt]
            start = elem.attrib.get("startDate", "")
            end = elem.attrib.get("endDate", "")
            source = elem.attrib.get("sourceName", "")

            # value: quantity 类型取 value 字段，category 类型取 value 字段（HKCategoryValue...）
            raw_value = elem.attrib.get("value", "")
            category = None
            value = None

            if rt == "HKCategoryTypeIdentifierSleepAnalysis":
                category = SLEEP_VALUE_MAP.get(raw_value, raw_value)
                # sleep 段的"值"用持续秒数
                sd = parse_iso(start)
                ed = parse_iso(end)
                value = (ed - sd).total_seconds() if sd and ed else None
            else:
                try:
                    value = float(raw_value)
                except (ValueError, TypeError):
                    value = None

            if value is None and category is None:
                skipped += 1
                elem.clear()
                continue

            rec = Record(
                record_type=short_name,
                start_date=start,
                end_date=end,
                value=value,
                unit=unit,
                source_name=source,
                category=category,
                creation_date=elem.attrib.get("creationDate", ""),
            )
            buffer.append(rec)
            inserted += 1

            if len(buffer) >= batch_size:
                if not dry_run:
                    session.bulk_save_objects(buffer)
                    session.commit()
                buffer = []
                elapsed = time.time() - t0
                rate = inserted / elapsed if elapsed > 0 else 0
                print(f"   ⏱️  {inserted:8d} 条  ({rate:6.0f}/s)")

        except Exception as e:
            errors += 1
            if errors < 5:
                print(f"   ⚠️  解析失败: {e}")

        elem.clear()

    # flush 剩余
    if buffer and not dry_run:
        session.bulk_save_objects(buffer)
        session.commit()

    elapsed = time.time() - t0
    print(f"\n✅ 完成:")
    print(f"   插入: {inserted} 条")
    print(f"   跳过: {skipped} 条（无 value/category）")
    print(f"   错误: {errors} 条")
    print(f"   耗时: {elapsed:.1f}s ({inserted / elapsed if elapsed > 0 else 0:.0f}/s)")

    if not dry_run:
        # 各 type 统计
        from sqlalchemy import func
        print(f"\n📊 入库分布:")
        rows = session.query(Record.record_type, func.count(Record.id)).group_by(Record.record_type).all()
        for rt, n in sorted(rows, key=lambda x: -x[1]):
            print(f"   {rt:20s} {n:8d}")

    return inserted


def main():
    parser = argparse.ArgumentParser(description="Apple Health export.xml → records 表")
    parser.add_argument("--xml", default=os.path.expanduser("~/Downloads/apple_health_export/导出.xml"),
                        help="导出.xml 路径")
    parser.add_argument("--types", nargs="*", default=None,
                        help="要 sync 的 HK type（默认5 个核心）。例: --types HKQuantityTypeIdentifierHeartRate")
    parser.add_argument("--batch-size", type=int, default=5000)
    parser.add_argument("--dry-run", action="store_true", help="只解析不写 db")
    parser.add_argument("--scan-only", action="store_true", help="只统计 type 不 sync")
    args = parser.parse_args()

    xml_path = Path(args.xml)
    if not xml_path.exists():
        print(f"❌ 找不到: {xml_path}")
        return 1

    # Pass 1: 扫描
    type_counts = scan_xml_types(xml_path)

    if args.scan_only:
        print(f"\n📋 xml 里所有 Record type（前 30）:")
        for rt, n in sorted(type_counts.items(), key=lambda x: -x[1])[:30]:
            print(f"   {n:8d}  {rt}")
        return 0

    # 选要 sync 的 type
    if args.types:
        target = {t: DEFAULT_RECORD_TYPES.get(t, (t.replace("HKQuantityTypeIdentifier", "").replace("HKCategoryTypeIdentifier", ""), "")) for t in args.types}
    else:
        target = DEFAULT_RECORD_TYPES

    # 校验 xml 里有这些 type
    missing = [t for t in target if t not in type_counts]
    if missing:
        print(f"⚠️  xml 里没有这些 type: {missing}")

    # Pass 2: 同步
    sync_records(xml_path, target, batch_size=args.batch_size, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())