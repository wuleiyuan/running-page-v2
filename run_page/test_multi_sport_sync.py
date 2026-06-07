"""
生成模拟 HAE 导出数据，验证 apple_health_sync.py 支持多运动类型。

用法：
  python3 test_multi_sport_sync.py
"""
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

# 模拟数据写到测试目录
TEST_DIR = Path("/tmp/hae_test")
TEST_DIR.mkdir(exist_ok=True)

# 清空旧测试
for f in TEST_DIR.glob("*.json"):
    f.unlink()


def make_test_data(sport, start_dt, duration_min, distance_m=0, hr_avg=120, energy_kcal=200):
    """生成单个 sport 的测试数据"""
    end_dt = start_dt + dt.timedelta(minutes=duration_min)

    return {
        "data": {
            "metrics": [
                {
                    "name": "heart_rate",
                    "units": "bpm",
                    "data": [
                        {"date": start_dt.strftime("%Y-%m-%d %H:%M:%S"), "qty": hr_avg},
                        {
                            "date": (start_dt + dt.timedelta(minutes=duration_min // 2)).strftime(
                                "%Y-%m-%d %H:%M:%S"
                            ),
                            "qty": hr_avg + 10,
                        },
                    ],
                },
                {
                    "name": "walking_running_distance",
                    "units": "m",
                    "data": [
                        {
                            "date": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                            "qty": distance_m if sport in {"Running", "Walking", "Hiking"} else 0,
                        }
                    ],
                },
                {
                    "name": "active_energy",
                    "units": "kcal",
                    "data": [
                        {
                            "date": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                            "qty": energy_kcal,
                        }
                    ],
                },
            ],
            "workouts": [
                {
                    "startDate": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "endDate": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "activityType": sport,
                }
            ],
        }
    }


# 生成 5 个不同运动的测试数据
tests = [
    ("Running", "2026-06-05 06:30:00", 45, 5000, 145, 380),
    ("Hiking", "2026-06-05 18:00:00", 90, 6000, 110, 420),
    ("Cycling", "2026-06-04 16:00:00", 60, 0, 135, 500),  # HAE 不含 cycling 距离
    ("Yoga", "2026-06-03 08:00:00", 30, 0, 75, 50),
    ("StairClimbing", "2026-06-02 19:00:00", 25, 0, 130, 180),
    ("FunctionalStrengthTraining", "2026-06-01 17:00:00", 50, 0, 120, 280),
    ("Boxing", "2026-05-31 20:00:00", 45, 0, 155, 400),
    ("Swimming", "2026-05-30 14:00:00", 30, 0, 140, 250),
    ("Walking", "2026-05-29 12:00:00", 60, 3000, 95, 150),
]

base_dt = dt.datetime(2026, 6, 1, 6, 0, 0)

for sport, date_str, dur, dist, hr, kcal in tests:
    # 用每条记录的 start_dt 写到不同天
    start = dt.datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    data = make_test_data(sport, start, dur, dist, hr, kcal)
    fname = f"health-export-{start.strftime('%Y-%m-%d')}.json"
    (TEST_DIR / fname).write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"  📄 {fname}  ({sport} {dur}min {dist}m)")

print(f"\n📂 测试数据已写到: {TEST_DIR}")
print(f"   跑: python3 apple_health_sync.py --data-dir {TEST_DIR}")
