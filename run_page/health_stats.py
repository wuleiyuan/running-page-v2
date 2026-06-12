"""
健康指标聚合（records 表 → health_stats.json）

为前端 /config 和 /health 页面提供 JSON 数据，避免前端查 db。
为 health_svg.py 提供同样的聚合逻辑（共用函数）。

输出：
  src/static/health_stats.json
  - top_stats: { hr: {...}, sleep: {...}, steps: {...}, hrv: {...} }  总览
  - daily: [...]  最近 365 天每日明细
  - by_year: { 2020: {...}, 2021: {...}, ... }  按年聚合

聚合规则：
  HR: 每日 mean/min/max + 区间（<60 休息 / 60-100 正常 / 100-140 燃脂 / 140-170 有氧 / >170 无氧）
  Sleep: 每日总 Asleep 时长 + 深/REM/Core 占比（中位数优先，过滤 >16h 异常日）
  Steps: 每日总数 + 月均
  HRV: 每日 mean
"""

import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config import JSON_FILE  # noqa: E402
from generator.db import init_db, Record  # noqa: E402
from sqlalchemy import and_, func

HEALTH_STATS_FILE = PROJECT_ROOT / "src" / "static" / "health_stats.json"

# HR 区间（bpm）
HR_ZONES = [
    ("rest", 0, 60),
    ("normal", 60, 100),
    ("fat_burn", 100, 140),
    ("aerobic", 140, 170),
    ("anaerobic", 170, 1000),
]


def date_key(date_str):
    """'2026-06-09 19:06:23 +0800' → '2026-06-09'"""
    if not date_str:
        return None
    return date_str[:10]


def aggregate_records(session):
    """一次性查全部 records，按 record_type 聚合到 daily"""
    # 取所有记录，按 type + date 分桶
    by_type_date = defaultdict(lambda: defaultdict(list))

    print("📊 聚合 records ...")
    total = 0
    batch = 0
    for rec in session.query(Record).yield_per(50000):
        total += 1
        d = date_key(rec.start_date)
        if not d:
            continue
        if rec.record_type == "SleepAnalysis":
            # sleep 按 category 分桶
            by_type_date[("SleepAnalysis", rec.category)][d].append(rec.value or 0)
        else:
            by_type_date[(rec.record_type, None)][d].append(rec.value)

    print(f"   扫了 {total} 条 Record")

    # 计算每日聚合
    daily_data = defaultdict(dict)

    # --- HR ---
    # 过滤异常值: < 30 (手环没戴) / > 220 (运动中 HR 静息混入)
    hr_by_date = by_type_date[("HeartRate", None)]
    for d, vals in hr_by_date.items():
        vals = [v for v in vals if v is not None and 30 <= v <= 220]
        if not vals:
            continue
        # 区间分布
        zones = {z[0]: 0 for z in HR_ZONES}
        for v in vals:
            for name, lo, hi in HR_ZONES:
                if lo <= v < hi:
                    zones[name] += 1
                    break
        daily_data[d]["hr"] = {
            "mean": round(sum(vals) / len(vals), 1),
            "min": min(vals),
            "max": max(vals),
            "count": len(vals),
            "zones": zones,
        }

    # --- RHR ---
    # 过滤异常值: < 30 (数据缺失/手环未戴) / > 120 (异常高)
    rhr_by_date = by_type_date[("RestingHeartRate", None)]
    for d, vals in rhr_by_date.items():
        vals = [v for v in vals if v is not None and 30 <= v <= 120]
        if not vals:
            continue
        daily_data[d]["rhr"] = {
            "mean": round(sum(vals) / len(vals), 1),
            "count": len(vals),
        }

    # --- HRV ---
    # 过滤异常值: < 10 / > 200 ms
    hrv_by_date = by_type_date[("HRV", None)]
    for d, vals in hrv_by_date.items():
        vals = [v for v in vals if v is not None and 10 <= v <= 200]
        if not vals:
            continue
        daily_data[d]["hrv"] = {
            "mean": round(sum(vals) / len(vals), 1),
            "count": len(vals),
        }

    # --- Steps ---
    steps_by_date = by_type_date[("StepCount", None)]
    for d, vals in steps_by_date.items():
        total_steps = sum(v for v in vals if v is not None)
        if total_steps == 0:
            continue
        daily_data[d]["steps"] = {
            "total": int(total_steps),
            "count": len(vals),
        }

    # --- Sleep（合并 category） ---
    sleep_keys = [k for k in by_type_date if k[0] == "SleepAnalysis"]
    sleep_by_date = defaultdict(lambda: {"total_sec": 0, "by_cat": defaultdict(float)})
    for (rt, cat), date_dict in by_type_date.items():
        if rt != "SleepAnalysis":
            continue
        for d, vals in date_dict.items():
            sec_sum = sum(vals)
            sleep_by_date[d]["by_cat"][cat] += sec_sum
            if cat and cat.startswith("Asleep"):
                sleep_by_date[d]["total_sec"] += sec_sum
    for d, s in sleep_by_date.items():
        if not s["total_sec"]:
            continue
        # 过滤异常日: < 1h (午睡片段/手环没戴) / > 14h (手环没摘/充电/误记)
        if s["total_sec"] > 14 * 3600:
            s["total_sec"] = 0
            continue
        if s["total_sec"] < 1 * 3600:
            s["total_sec"] = 0
            continue
        daily_data[d]["sleep"] = {
            "total_hours": round(s["total_sec"] / 3600, 2),
            "deep_hours": round(s["by_cat"].get("AsleepDeep", 0) / 3600, 2),
            "rem_hours": round(s["by_cat"].get("AsleepREM", 0) / 3600, 2),
            "core_hours": round(s["by_cat"].get("AsleepCore", 0) / 3600, 2),
            "unspec_hours": round(s["by_cat"].get("AsleepUnspec", 0) / 3600, 2),
        }

    return daily_data


def compute_top_stats(daily_data):
    """总体统计：总览数字（已过滤异常值）"""
    hr_means = [d["hr"]["mean"] for d in daily_data.values() if "hr" in d and 30 <= d["hr"]["mean"] <= 220]
    rhr_means = [d["rhr"]["mean"] for d in daily_data.values() if "rhr" in d and 30 <= d["rhr"]["mean"] <= 120]
    hrv_means = [d["hrv"]["mean"] for d in daily_data.values() if "hrv" in d and 10 <= d["hrv"]["mean"] <= 200]
    sleep_hours = [d["sleep"]["total_hours"] for d in daily_data.values() if "sleep" in d and 1 <= d["sleep"]["total_hours"] <= 14]
    steps_totals = [d["steps"]["total"] for d in daily_data.values() if "steps" in d]

    def median(vals):
        if not vals:
            return 0
        s = sorted(vals)
        n = len(s)
        return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2

    top = {
        "hr": {
            "mean_all": round(sum(hr_means) / len(hr_means), 1) if hr_means else 0,
            "median": round(median(hr_means), 1) if hr_means else 0,
            "max_ever": max((d["hr"]["max"] for d in daily_data.values() if "hr" in d), default=0),
            "days_with_data": len(hr_means),
        },
        # RHR: 防御 min_ever 拿到的可能是 0/异常低
        "rhr": {
            "mean_all": round(sum(rhr_means) / len(rhr_means), 1) if rhr_means else 0,
            "median": round(median(rhr_means), 1) if rhr_means else 0,
            "min_ever": min(rhr_means) if rhr_means else 0,
            "days_with_data": len(rhr_means),
        },
        "hrv": {
            "mean_all": round(sum(hrv_means) / len(hrv_means), 1) if hrv_means else 0,
            "median": round(median(hrv_means), 1) if hrv_means else 0,
            "days_with_data": len(hrv_means),
        },
        "sleep": {
            "median_hours": round(median(sleep_hours), 2) if sleep_hours else 0,
            "days_with_data": len(sleep_hours),
        },
        "steps": {
            "mean_daily": round(sum(steps_totals) / len(steps_totals), 0) if steps_totals else 0,
            "median_daily": int(median(steps_totals)) if steps_totals else 0,
            "total": int(sum(steps_totals)) if steps_totals else 0,
            "days_with_data": len(steps_totals),
        },
    }
    return top


def compute_by_year(daily_data):
    """按年聚合"""
    by_year = defaultdict(lambda: defaultdict(list))
    for d, data in daily_data.items():
        year = d[:4]
        if "hr" in data:
            by_year[year]["hr"].append(data["hr"]["mean"])
        if "sleep" in data and data["sleep"]["total_hours"] > 0:
            by_year[year]["sleep"].append(data["sleep"]["total_hours"])
        if "steps" in data:
            by_year[year]["steps"].append(data["steps"]["total"])
        if "hrv" in data:
            by_year[year]["hrv"].append(data["hrv"]["mean"])

    result = {}
    for year, metrics in sorted(by_year.items()):
        result[year] = {}
        if metrics.get("hr"):
            vals = metrics["hr"]
            result[year]["hr_mean"] = round(sum(vals) / len(vals), 1)
        if metrics.get("sleep"):
            vals = sorted(metrics["sleep"])
            n = len(vals)
            result[year]["sleep_median_h"] = round(vals[n // 2] if n % 2 == 1 else (vals[n // 2 - 1] + vals[n // 2]) / 2, 2)
        if metrics.get("steps"):
            vals = metrics["steps"]
            result[year]["steps_mean_daily"] = int(sum(vals) / len(vals))
            result[year]["steps_total"] = int(sum(vals))
        if metrics.get("hrv"):
            vals = metrics["hrv"]
            result[year]["hrv_mean"] = round(sum(vals) / len(vals), 1)
        result[year]["days_with_data"] = max(len(metrics.get(k, [])) for k in ["hr", "sleep", "steps", "hrv"])
    return result


def main():
    session = init_db(str(PROJECT_ROOT / "run_page" / "data.db"))

    daily_data = aggregate_records(session)
    print(f"\n📅 有数据的日期: {len(daily_data)} 天")

    top_stats = compute_top_stats(daily_data)
    print(f"\n📊 总览:")
    print(f"   HR  均值={top_stats['hr']['mean_all']} bpm  中位={top_stats['hr']['median']}  最高={top_stats['hr']['max_ever']}")
    print(f"   RHR 中位={top_stats['rhr']['median']} bpm  最低={top_stats['rhr']['min_ever']}")
    print(f"   HRV 中位={top_stats['hrv']['median']} ms")
    print(f"   睡眠中位 {top_stats['sleep']['median_hours']} h")
    print(f"   步数日均 {top_stats['steps']['mean_daily']:.0f}  累计 {top_stats['steps']['total']:,}")

    by_year = compute_by_year(daily_data)
    print(f"\n📅 按年:")
    for y, m in sorted(by_year.items()):
        print(f"   {y}: HR均值={m.get('hr_mean', '-')}  睡眠={m.get('sleep_median_h', '-')}h  日均步={m.get('steps_mean_daily', '-')}")

    # 输出
    out = {
        "generated_at": dt.datetime.now().isoformat(),
        "top_stats": top_stats,
        "by_year": by_year,
        "daily": dict(sorted(daily_data.items())),
    }
    HEALTH_STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HEALTH_STATS_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 写入 {HEALTH_STATS_FILE} ({HEALTH_STATS_FILE.stat().st_size / 1024:.0f} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())