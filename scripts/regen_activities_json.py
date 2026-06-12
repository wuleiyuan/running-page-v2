#!/usr/bin/env python3
"""
重生 src/static/activities.json —— 纯 SQLite + jq，绕开 gpxtrackposter 依赖。

步骤：
1. sqlite3 输出所有活动（已应用 generator.load() 同样的 filter）
2. 计算 streak（连续 N 天都有活动，从第 1 天开始计 1，第二天+1，断则重置为 1）
3. 排序（最新在前）
4. 写 json

用法：python3 scripts/regen_activities_json.py
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "run_page", "data.db")
JSON_PATH = os.path.join(ROOT, "src", "static", "activities.json")
BACKUP_PATH = JSON_PATH + ".bak-before-regen"

# generator.load() 同样的 filter
SQL = """
SELECT
  run_id,
  name,
  distance,
  moving_time,
  elapsed_time,
  type,
  start_date,
  start_date_local,
  location_country,
  summary_polyline,
  average_heartrate,
  average_speed,
  subtype,
  elevation_gain
FROM activities
WHERE (distance > 0.1 AND distance IS NOT NULL)
   OR type IN ('StairStepper', 'RopeSkipping')
ORDER BY start_date_local ASC
"""


def compute_streak(activities):
    """跟 generator/__init__.py:147-166 同样的逻辑：
    按 start_date_local 升序遍历，同一天 streak 不变，下一天 +1，断则重置为 1。
    注意：返回的是反向列表（最新在前），所以 streak 是从后往前算的，遍历时拿到的 streak 是 "截止到那一天" 的连续天数。
    """
    last_date = None
    streak = 0
    # generator 是按升序算 streak 后返回 [::-1] 反转
    # 所以我们对升序结果算 streak（值是"截止到那天"的连续天数）
    for a in activities:
        date = datetime.strptime(a["start_date_local"], "%Y-%m-%d %H:%M:%S").date()
        if last_date is None:
            streak = 1
        elif date == last_date:
            pass
        elif date == last_date + timedelta(days=1):
            streak += 1
        else:
            assert date > last_date
            streak = 1
        a["streak"] = streak
        last_date = date
    # 反转（最新在前）
    return list(reversed(activities))


def main():
    print(f"[regen] DB_PATH = {DB_PATH}")
    print(f"[regen] JSON_PATH = {JSON_PATH}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute(SQL).fetchall()
    activities = [dict(r) for r in rows]
    con.close()
    print(f"[regen] loaded {len(activities)} activities from db (after filter)")

    activities = compute_streak(activities)

    # 备份原 json
    if os.path.exists(JSON_PATH):
        shutil.copy2(JSON_PATH, BACKUP_PATH)
        print(f"[regen] backed up original to {BACKUP_PATH}")

    # 写新 json
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(activities, f, ensure_ascii=False)
    print(f"[regen] wrote {len(activities)} activities to {JSON_PATH}")

    # 汇总
    from collections import Counter
    type_counts = Counter(a["type"] for a in activities)
    print(f"[regen] type distribution: {dict(type_counts)}")


if __name__ == "__main__":
    main()
