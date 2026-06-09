"""
Apple Health export.xml 一次性解析脚本（两遍扫描版）

iPhone 健康 App → 隐私与安全 → 导出所有健康数据 → 导出.xml
路径：~/Downloads/apple_health_export/导出.xml

两遍扫描：
  Pass 1: 收集所有 <Workout> 元素（时间窗口 + 类型）
  Pass 2: 收集所有 <Record type=DistanceWalkingRunning/Cycling/Swimming> 元素
          按时间窗口聚合到对应 workout

输出：data.db + activities.json
"""

import argparse
import datetime as dt
import json
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config import JSON_FILE, SQL_FILE  # noqa: E402

# Apple HealthKit workoutActivityType → running-page type
XML_TYPE_MAP = {
    "HKWorkoutActivityTypeRunning": ("Run", "跑步"),
    "HKWorkoutActivityTypeWalking": ("Walk", "步行"),
    "HKWorkoutActivityTypeCycling": ("Ride", "骑行"),
    "HKWorkoutActivityTypeHiking": ("Hiking", "徒步"),
    "HKWorkoutActivityTypeMountaineering": ("Hiking", "徒步"),
    "HKWorkoutActivityTypeElliptical": ("Elliptical", "椭圆机"),
    "HKWorkoutActivityTypeRowing": ("Rowing", "划船机"),
    "HKWorkoutActivityTypeStairClimbing": ("StairStepper", "爬楼"),
    "HKWorkoutActivityTypeStairs": ("StairStepper", "爬楼"),
    "HKWorkoutActivityTypeStepTraining": ("Workout", "训练"),
    "HKWorkoutActivityTypeCrossTraining": ("CrossTraining", "交叉训练"),
    "HKWorkoutActivityTypeWheelchair": ("Wheelchair", "轮椅"),
    "HKWorkoutActivityTypeWheelchairRunPace": ("Run", "跑步"),
    "HKWorkoutActivityTypeWheelchairWalkPace": ("Walk", "步行"),
    "HKWorkoutActivityTypeJumpRope": ("RopeSkipping", "跳绳"),
    "HKWorkoutActivityTypeRopeSkipping": ("RopeSkipping", "跳绳"),
    "HKWorkoutActivityTypeFunctionalStrengthTraining": ("Workout", "力量训练"),
    "HKWorkoutActivityTypeTraditionalStrengthTraining": ("Workout", "力量训练"),
    "HKWorkoutActivityTypeCoreTraining": ("Workout", "核心训练"),
    "HKWorkoutActivityTypeHIIT": ("Workout", "HIIT"),
    "HKWorkoutActivityTypePilates": ("Workout", "普拉提"),
    "HKWorkoutActivityTypeYoga": ("Yoga", "瑜伽"),
    "HKWorkoutActivityTypeTaiChi": ("Workout", "太极"),
    "HKWorkoutActivityTypeBarre": ("Workout", "芭蕾"),
    "HKWorkoutActivityTypeCalisthenics": ("Workout", "徒手训练"),
    "HKWorkoutActivityTypeBoxing": ("Boxing", "拳击"),
    "HKWorkoutActivityTypeKickboxing": ("Kickboxing", "踢拳"),
    "HKWorkoutActivityTypeMartialArts": ("MartialArts", "武术"),
    "HKWorkoutActivityTypeWrestling": ("Wrestling", "摔跤"),
    "HKWorkoutActivityTypeSoccer": ("Soccer", "足球"),
    "HKWorkoutActivityTypeBasketball": ("Basketball", "篮球"),
    "HKWorkoutActivityTypeTennis": ("Tennis", "网球"),
    "HKWorkoutActivityTypeBadminton": ("Badminton", "羽毛球"),
    "HKWorkoutActivityTypeTableTennis": ("TableTennis", "乒乓球"),
    "HKWorkoutActivityTypeGolf": ("Golf", "高尔夫"),
    "HKWorkoutActivityTypeBaseball": ("Baseball", "棒球"),
    "HKWorkoutActivityTypeSoftball": ("Softball", "垒球"),
    "HKWorkoutActivityTypeVolleyball": ("Volleyball", "排球"),
    "HKWorkoutActivityTypeFootball": ("Football", "橄榄球"),
    "HKWorkoutActivityTypeHockey": ("Hockey", "曲棍球"),
    "HKWorkoutActivityTypeLacrosse": ("Lacrosse", "长曲棍球"),
    "HKWorkoutActivityTypeRugby": ("Rugby", "橄榄球"),
    "HKWorkoutActivityTypeCricket": ("Cricket", "板球"),
    "HKWorkoutActivityTypeHandball": ("Handball", "手球"),
    "HKWorkoutActivityTypeDiscSports": ("Workout", "飞盘"),
    "HKWorkoutActivityTypeSwimming": ("Swim", "游泳"),
    "HKWorkoutActivityTypeOpenWaterSwim": ("Swim", "户外游泳"),
    "HKWorkoutActivityTypePoolSwim": ("Swim", "泳池游泳"),
    "HKWorkoutActivityTypeWaterFitness": ("Workout", "水上健身"),
    "HKWorkoutActivityTypeWaterPolo": ("Workout", "水球"),
    "HKWorkoutActivityTypeDiving": ("Workout", "潜水"),
    "HKWorkoutActivityTypeSurfing": ("Surfing", "冲浪"),
    "HKWorkoutActivityTypePaddleSports": ("PaddleSports", "桨板"),
    "HKWorkoutActivityTypeRowingMachine": ("Rowing", "划船机"),
    "HKWorkoutActivityTypeUnderwaterDiving": ("Workout", "潜水"),
    "HKWorkoutActivityTypeSkiing": ("AlpineSkiing", "滑雪"),
    "HKWorkoutActivityTypeSnowboarding": ("Snowboard", "单板"),
    "HKWorkoutActivityTypeCrossCountrySkiing": ("CrossCountrySkiing", "越野滑雪"),
    "HKWorkoutActivityTypeSnowshoeing": ("Hiking", "雪鞋徒步"),
    "HKWorkoutActivityTypeSkatingSports": ("SkatingSports", "滑冰"),
    "HKWorkoutActivityTypeClimbing": ("Climbing", "攀岩"),
    "HKWorkoutActivityTypeFishing": ("Workout", "钓鱼"),
    "HKWorkoutActivityTypeHunting": ("Workout", "狩猎"),
    "HKWorkoutActivityTypeArchery": ("Workout", "射箭"),
    "HKWorkoutActivityTypeShooting": ("Workout", "射击"),
    "HKWorkoutActivityTypeBowling": ("Workout", "保龄球"),
    "HKWorkoutActivityTypeFencing": ("Workout", "击剑"),
    "HKWorkoutActivityTypeTrackAndField": ("Run", "田径"),
    "HKWorkoutActivityTypePlay": ("Workout", "游戏"),
    "HKWorkoutActivityTypeMindAndBody": ("Workout", "身心"),
    "HKWorkoutActivityTypeCooldown": ("Workout", "放松"),
    "HKWorkoutActivityTypePreparation": ("Workout", "热身"),
    "HKWorkoutActivityTypeOther": ("Workout", "其他"),
    "HKWorkoutActivityTypeMultisport": ("Workout", "多项"),
    "HKWorkoutActivityTypeTransition": ("Workout", "转换"),
}

# 距离字段 → 对应运动类型 (Apple 距离单位：km)
DISTANCE_TYPE_MAP = {
    "HKQuantityTypeIdentifierDistanceWalkingRunning": {"Run", "Walk", "Hiking", "StairStepper", "RopeSkipping"},
    "HKQuantityTypeIdentifierDistanceCycling": {"Ride"},
    "HKQuantityTypeIdentifierDistanceSwimming": {"Swim"},
    "HKQuantityTypeIdentifierDistanceWheelchair": {"Wheelchair"},
}


def parse_iso(date_str):
    if not date_str:
        return None
    return dt.datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S %z")


def duration_to_minutes(duration_str):
    if not duration_str:
        return 0
    return float(duration_str)


def main():
    parser = argparse.ArgumentParser(description="Apple Health export.xml → running-page db")
    parser.add_argument("--xml", required=True, help="导出.xml 路径")
    parser.add_argument("--dry-run", action="store_true", help="只解析不写 db")
    args = parser.parse_args()

    xml_path = Path(args.xml)
    if not xml_path.exists():
        print(f"❌ 找不到: {xml_path}")
        return 1

    print(f"📂 Pass 1: 扫 {xml_path} 收集 <Workout> ...")

    # ========== Pass 1: 收集所有 workout ==========
    workouts = []
    for event, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag == "Workout":
            attrs = elem.attrib
            activity_type = attrs.get("workoutActivityType", "")
            if activity_type in XML_TYPE_MAP:
                start_dt = parse_iso(attrs.get("startDate", ""))
                end_dt = parse_iso(attrs.get("endDate", ""))
                if start_dt and end_dt:
                    type_str, type_cn = XML_TYPE_MAP[activity_type]
                    source_name = attrs.get("sourceName", "")
                    # 同一秒可能多设备，加 sourceName 哈希
                    run_id = int(start_dt.timestamp() * 1000) + abs(hash(source_name)) % 10000
                    duration_min = duration_to_minutes(attrs.get("duration", "0"))
                    # 平均心率
                    avg_hr = None
                    for stat in elem.findall("WorkoutStatistics"):
                        if stat.attrib.get("type") == "HKQuantityTypeIdentifierHeartRate":
                            avg_hr = float(stat.attrib.get("average", "0") or 0) or None
                            break
                    # 卡路里
                    energy_kcal = 0.0
                    for stat in elem.findall("WorkoutStatistics"):
                        if stat.attrib.get("type") == "HKQuantityTypeIdentifierActiveEnergyBurned":
                            energy_kcal = float(stat.attrib.get("sum", "0") or 0)
                            break
                    workouts.append({
                        "run_id": run_id,
                        "name": f"{type_cn} {activity_type.replace('HKWorkoutActivityType', '')}",
                        "distance": 0.0,  # 第二遍填
                        "moving_time": f"1970-01-01 {start_dt.strftime('%H:%M:%S')}.000000",
                        "type": type_str,
                        "subtype": type_str,
                        "start_date": start_dt.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        "start_date_local": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                        "location_country": "",
                        "summary_polyline": "",
                        "average_heartrate": avg_hr,
                        "average_speed": None,
                        "elevation_gain": 0.0,
                        "_start_dt": start_dt,
                        "_end_dt": end_dt,
                        "_duration_sec": int(duration_min * 60),
                        "_activity_type": activity_type,
                    })
            elem.clear()

    print(f"📊 收集到 {len(workouts)} 个有效 workout")

    # ========== Pass 2: 收集距离 Records + 按时间窗口聚合 ==========
    print(f"📂 Pass 2: 扫 <Record type=Distance...> 聚合距离 ...")
    # 索引：按小时桶加速（每个 workout 放它对应的小时段）
    # 简化：每个 Record 遍历所有 workout 找时间窗口匹配
    # 296 workouts × 几千个 record → 100w 次比较，1.15GB XML 也就 1-2 分钟
    distance_by_workout = {w["run_id"]: 0.0 for w in workouts}
    record_count = 0
    matched_count = 0

    for event, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag == "Record":
            record_count += 1
            rec_type = elem.attrib.get("type", "")
            if rec_type not in DISTANCE_TYPE_MAP:
                elem.clear()
                continue
            rec_start = parse_iso(elem.attrib.get("startDate", ""))
            rec_end = parse_iso(elem.attrib.get("endDate", ""))
            value_km = float(elem.attrib.get("value", "0") or 0)
            if not rec_start or value_km <= 0:
                elem.clear()
                continue
            # 找匹配的 workout：rec 时间窗口落在 workout 时间窗口内
            for w in workouts:
                if w["type"] in DISTANCE_TYPE_MAP[rec_type]:
                    if w["_start_dt"] <= rec_start and rec_end <= w["_end_dt"]:
                        distance_by_workout[w["run_id"]] += value_km
                        matched_count += 1
                        break
            elem.clear()
    print(f"📊 扫了 {record_count} 个 Record, {matched_count} 个匹配到 workout")

    # 把距离写回 workout + 计算 avg_speed
    for w in workouts:
        w["distance"] = distance_by_workout[w["run_id"]] * 1000  # km → m
        if w["distance"] > 0 and w["_duration_sec"] > 0:
            w["average_speed"] = w["distance"] / w["_duration_sec"]
        # 删内部字段
        del w["_start_dt"]
        del w["_end_dt"]
        del w["_duration_sec"]
        del w["_activity_type"]

    # 按 type 统计
    by_type = {}
    for w in workouts:
        by_type.setdefault(w["type"], 0)
        by_type[w["type"]] += 1
    print(f"\n📋 按类型分布:")
    for t, n in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"   {t:20s} {n:4d} 条")

    # 按月统计跑步 + 距离
    by_month = {}
    for w in workouts:
        if w["type"] == "Run":
            month = w["start_date_local"][:7]
            by_month.setdefault(month, [0, 0.0])
            by_month[month][0] += 1
            by_month[month][1] += w["distance"] / 1000
    print(f"\n📈 跑步月份统计 (解析后):")
    for m in sorted(by_month):
        cnt, km = by_month[m]
        print(f"   {m}  {cnt:3d} 条  {km:6.1f} km")

    if args.dry_run:
        print("\n🔍 DRY RUN 模式，不写 db")
        return 0

    # 写 db
    conn = sqlite3.connect(str(SQL_FILE))
    cur = conn.cursor()
    insert_sql = """
    INSERT OR REPLACE INTO activities
    (run_id, name, distance, moving_time, type, subtype, start_date,
     start_date_local, location_country, summary_polyline,
     average_heartrate, average_speed, elevation_gain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    inserted = 0
    for w in workouts:
        cur.execute(insert_sql, (
            w["run_id"], w["name"], w["distance"], w["moving_time"],
            w["type"], w["subtype"], w["start_date"], w["start_date_local"],
            w["location_country"], w["summary_polyline"],
            w["average_heartrate"], w["average_speed"], w["elevation_gain"],
        ))
        inserted += 1
    conn.commit()
    conn.close()
    print(f"\n✅ 完成: 写 {inserted} 条到 {SQL_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
