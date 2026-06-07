"""
Apple Health Auto Export Sync (简化版，不依赖 stravalib)

从 Health Auto Export (iOS App) 导出的 JSON 喂数据到 running-page-v2 的 data.db。

支持的运动类型：跑步 / 徒步 / 骑行 / 步行 / 瑜伽 / 力量训练 / 等等
（取决于 Apple Workout activityType 字段）

注意：HAE 默认不输出 GPS 轨迹，summary_polyline 留空。
运动轨迹需要在 Apple HealthKit / Strava 端同步过来。

用法：
  # 默认读取 ~/Library/Mobile Documents/com~apple~CloudDocs/HealthAutoExport/
  python apple_health_sync.py

  # 指定目录
  python apple_health_sync.py --data-dir /path/to/icloud/HealthAutoExport

  # 干跑（不写 db）
  python apple_health_sync.py --dry-run
"""
import argparse
import datetime as dt
import json
import logging
import os
import sys
import warnings
from pathlib import Path
from types import SimpleNamespace

# 抑制 pydantic v1/v2 警告
warnings.filterwarnings("ignore", category=DeprecationWarning)

# 把项目根目录加进 path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# 不 import generator 包（避免导入 stravalib / gpxtrackposter 等重依赖）
# 直接读 generator/db.py 文件源码
import importlib.util
DB_PY = PROJECT_ROOT / "run_page" / "generator" / "db.py"
_spec = importlib.util.spec_from_file_location("hae_db", DB_PY)
hae_db = importlib.util.module_from_spec(_spec)
try:
    _spec.loader.exec_module(hae_db)
except Exception as e:
    # db.py 引用了 geopy（Nominatim 反查位置），如果 geopy 不在仍然能用 sync
    # 我们 patch 掉位置反查
    print(f"⚠️ generator/db.py 加载警告: {e}")
    import types
    fake_geopy = types.ModuleType("geopy")
    fake_geopy.geocoders = types.ModuleType("geopy.geocoders")
    fake_geopy.geocoders.Nominatim = lambda **kw: type("N", (), {"reverse": staticmethod(lambda *a, **k: None)})()
    fake_geopy.geocoders.options = SimpleNamespace(default_user_agent="running_page")
    sys.modules["geopy"] = fake_geopy
    sys.modules["geopy.geocoders"] = fake_geopy.geocoders
    _spec.loader.exec_module(hae_db)

init_db = hae_db.init_db
update_or_create_activity = hae_db.update_or_create_activity
Activity = hae_db.Activity

from config import JSON_FILE, SQL_FILE  # noqa: E402

logger = logging.getLogger("apple_health_sync")

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

# Apple Health Auto Export 默认 iCloud 同步目录
DEFAULT_ICLOUD_DIR = (
    Path.home()
    / "Library"
    / "Mobile Documents"
    / "com~apple~CloudDocs"
    / "HealthAutoExport"
)

# Apple workout activityType → running-page 标准 type 字段
# Strava 兼容名（前端按这个渲染图标和颜色）
HAE_TYPE_MAP = {
    # 有氧
    "Running": "Run",
    "Walking": "Walk",
    "Cycling": "Ride",
    "Hiking": "Hiking",
    "Mountaineering": "Hiking",
    "Elliptical": "Elliptical",
    "Rowing": "Rowing",
    "StairClimbing": "StairStepper",
    "Stairs": "StairStepper",
    "StepTraining": "Workout",
    "CrossTraining": "CrossTraining",
    "Wheelchair": "Wheelchair",
    "WheelchairRunPace": "Run",
    "WheelchairWalkPace": "Walk",
    # 力量/器械
    "FunctionalStrengthTraining": "Workout",
    "TraditionalStrengthTraining": "Workout",
    "CoreTraining": "Workout",
    "HIIT": "Workout",
    "Pilates": "Workout",
    "Yoga": "Yoga",
    "TaiChi": "Workout",
    # 搏击
    "Boxing": "Boxing",
    "Kickboxing": "Kickboxing",
    "MartialArts": "MartialArts",
    "Wrestling": "Wrestling",
    # 球类
    "Soccer": "Workout",
    "Basketball": "Workout",
    "Tennis": "Workout",
    "Badminton": "Workout",
    "TableTennis": "Workout",
    "Golf": "Workout",
    "Baseball": "Workout",
    "Volleyball": "Workout",
    "Football": "Workout",
    "Hockey": "Workout",
    "Lacrosse": "Workout",
    "Rugby": "Workout",
    "Cricket": "Workout",
    # 水上
    "Swimming": "Swim",
    "OpenWaterSwim": "Swim",
    "PoolSwim": "Swim",
    "WaterFitness": "Workout",
    "WaterPolo": "Workout",
    "Diving": "Workout",
    "Surfing": "Workout",
    "PaddleSports": "Workout",
    "RowingMachine": "Rowing",
    # 雪上
    "Skiing": "AlpineSkiing",
    "CrossCountrySkiing": "CrossCountrySkiing",
    "Snowboarding": "Workout",
    "Snowshoeing": "Hiking",
    "SkatingSports": "Workout",
    # 户外
    "Climbing": "Workout",
    "Fishing": "Workout",
    "Hunting": "Workout",
    "Archery": "Workout",
    "Shooting": "Workout",
    "Bowling": "Workout",
    "Fencing": "Workout",
    # 杂项
    "TrackAndField": "Run",
    "Play": "Workout",
    "MindAndBody": "Workout",
    "Cooldown": "Workout",
    "Preparation": "Workout",
    "Other": "Workout",
    "Multisport": "Workout",
    "Transition": "Workout",
}

# 运动类型对应的中文名（用于活动名称）
HAE_TYPE_CN = {
    "Run": "跑步", "Walk": "步行", "Ride": "骑行", "Hiking": "徒步",
    "Yoga": "瑜伽", "Workout": "训练", "CrossTraining": "交叉训练",
    "Elliptical": "椭圆机", "Rowing": "划船机", "StairStepper": "爬楼",
    "Swim": "游泳", "Climbing": "攀岩", "Surfing": "冲浪",
    "AlpineSkiing": "滑雪", "Snowboard": "单板滑雪",
    "CrossCountrySkiing": "越野滑雪", "Wheelchair": "轮椅",
    "Boxout": "拳击", "Multisport": "多项运动",
}


# ---------------------------------------------------------------------------
# 解析逻辑
# ---------------------------------------------------------------------------

def find_metric_value(metrics, name):
    for m in metrics:
        if m.get("name") == name:
            return m.get("data", [])
    return []


def find_distance_for_workout(workout, metrics):
    """
    HAE 默认 walking_running_distance 包含步行+跑步+徒步。
    cycling 距离需要另外的 metric（HAE 默认不输出）。
    """
    activity_type = workout.get("activityType", "")
    w_start = dt.datetime.strptime(workout["startDate"], "%Y-%m-%d %H:%M:%S")
    w_end = dt.datetime.strptime(workout["endDate"], "%Y-%m-%d %H:%M:%S")

    if activity_type in {"Running", "Walking", "Hiking", "Mountaineering"}:
        points = find_metric_value(metrics, "walking_running_distance")
        if not points:
            return 0
        total = 0
        for p in points:
            try:
                ts = dt.datetime.strptime(p["date"], "%Y-%m-%d %H:%M:%S")
            except (KeyError, ValueError):
                continue
            if w_start <= ts < w_end:
                total += float(p.get("qty", 0))
        return total
    return 0


def find_avg_heartrate(workout, metrics):
    w_start = dt.datetime.strptime(workout["startDate"], "%Y-%m-%d %H:%M:%S")
    w_end = dt.datetime.strptime(workout["endDate"], "%Y-%m-%d %H:%M:%S")
    points = find_metric_value(metrics, "heart_rate")
    vals = []
    for p in points:
        try:
            ts = dt.datetime.strptime(p["date"], "%Y-%m-%d %H:%M:%S")
        except (KeyError, ValueError):
            continue
        if w_start <= ts <= w_end:
            v = p.get("qty")
            if v and 30 < v < 220:
                vals.append(v)
    return sum(vals) / len(vals) if vals else None


def workout_to_track(workout, metrics):
    """HAE workout → SimpleNamespace（兼容 update_or_create_activity）"""
    activity_type = workout.get("activityType", "Other")
    track_type = HAE_TYPE_MAP.get(activity_type, "Workout")

    w_start = dt.datetime.strptime(workout["startDate"], "%Y-%m-%d %H:%M:%S")
    w_end = dt.datetime.strptime(workout["endDate"], "%Y-%m-%d %H:%M:%S")
    duration_sec = int((w_end - w_start).total_seconds())

    distance_m = find_distance_for_workout(workout, metrics)
    avg_hr = find_avg_heartrate(workout, metrics)

    avg_speed = None
    if distance_m and distance_m > 0 and duration_sec > 0:
        avg_speed = distance_m / duration_sec

    type_cn = HAE_TYPE_CN.get(track_type, track_type)
    name = f"{type_cn} {activity_type}"

    # run_id 用 startDate 的 timestamp 毫秒 + 随机后缀（避免同一天多次冲突）
    import random
    track_id = int(w_start.timestamp() * 1000) + random.randint(100, 999)

    # 用 SimpleNamespace 模拟 run_activity 对象
    track = SimpleNamespace(
        id=track_id,
        name=name,
        type=track_type,
        subtype=track_type,
        distance=float(distance_m) if distance_m else 0.0,
        moving_time=dt.timedelta(seconds=duration_sec),
        elapsed_time=dt.timedelta(seconds=duration_sec),
        start_date=w_start.strftime("%Y-%m-%d %H:%M:%S"),
        start_date_local=w_start.strftime("%Y-%m-%d %H:%M:%S"),
        location_country="",
        average_heartrate=avg_hr,
        average_speed=float(avg_speed) if avg_speed else 0.0,
        elevation_gain=None,
        total_elevation_gain=None,
        start_latlng=None,
        map=SimpleNamespace(summary_polyline=""),
    )
    return track


def discover_files(data_dir):
    return sorted(data_dir.glob("health-export-*.json"), key=lambda x: x.stat().st_mtime)


def load_data_file(path):
    with open(path) as f:
        return json.load(f)


def regenerate_activities_json(session):
    """从 db 重新生成 src/static/activities.json"""
    activities = session.query(Activity).all()
    out = []
    for a in activities:
        out.append(a.to_dict())
    with open(JSON_FILE, "w") as f:
        json.dump(out, f, indent=2, default=str)
    return out


def run_apple_health_sync(data_dir=None, dry_run=False):
    if data_dir is None:
        data_dir = DEFAULT_ICLOUD_DIR

    if not data_dir.exists():
        print(f"❌ 目录不存在: {data_dir}")
        return 0

    files = discover_files(data_dir)
    print(f"📂 在 {data_dir} 找到 {len(files)} 个 HAE 文件")

    if not files:
        print("⚠️ 没有数据文件。请先在 iPhone 跑 Health Auto Export")
        return 0

    # 解析所有 workout
    all_tracks = []
    for f in files:
        print(f"  📄 {f.name}  ({f.stat().st_size}B)")
        data = load_data_file(f)
        metrics = data.get("data", {}).get("metrics", [])
        workouts = data.get("data", {}).get("workouts", [])
        for w in workouts:
            track = workout_to_track(w, metrics)
            all_tracks.append(track)
            print(
                f"    🏃 {track.start_date_local} {track.name}  "
                f"type={track.type} dist={track.distance/1000:.2f}km "
                f"hr={track.average_heartrate}"
            )

    print(f"\n📊 共解析 {len(all_tracks)} 条 workout")

    if dry_run:
        print("🔍 DRY RUN 模式，不写 db")
        return len(all_tracks)

    # 写入 db
    session = init_db(SQL_FILE)
    new_count = 0
    update_count = 0
    for t in all_tracks:
        created = update_or_create_activity(session, t)
        if created:
            new_count += 1
        else:
            update_count += 1
    session.commit()

    # 重新生成 activities.json
    activities_list = regenerate_activities_json(session)
    print(f"\n✅ 完成: 新增 {new_count} 条 / 更新 {update_count} 条")
    print(f"📁 db: {SQL_FILE}")
    print(f"📁 json: {JSON_FILE}")
    return new_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apple Health Auto Export → running-page sync")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_ICLOUD_DIR, help="HAE iCloud 目录")
    parser.add_argument("--dry-run", action="store_true", help="只解析不写 db")
    args = parser.parse_args()

    run_apple_health_sync(data_dir=args.data_dir, dry_run=args.dry_run)
