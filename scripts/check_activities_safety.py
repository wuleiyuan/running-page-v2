#!/usr/bin/env python3
"""
activities.json 数据完整性保护 — v2.2.5

用户 6/13 反馈: "数据又丢了" (2 次)
根因: GitHub Action sync (chore: sync sports data) 写 activities.json 时, 只回写 86 条
      把 7 年 562 条历史覆盖了

保护策略:
1. 读取 master HEAD 上一个版本的 activities.json 计数
2. 跟当前 working tree 比, 如果下跌 > 30%, exit 1 (CI fail)
3. 输出 diff 报告 (year distribution 变化)

用法:
  在 sync workflow 里: python3 scripts/check_activities_safety.py <new_count>
  或者单独跑: python3 scripts/check_activities_safety.py
"""
import json
import os
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, "src", "static", "activities.json")

THRESHOLD_DROP_RATIO = 0.30  # 下跌超过 30% 视为危险
THRESHOLD_MIN_ABSOLUTE = 50   # 绝对值少 50 条也视为危险 (防止小数据集误判)


def count_activities_in_file(path: str) -> int:
    if not os.path.exists(path):
        return 0
    with open(path) as f:
        d = json.load(f)
    return len(d) if isinstance(d, list) else 0


def get_year_distribution(path: str) -> Counter:
    if not os.path.exists(path):
        return Counter()
    with open(path) as f:
        d = json.load(f)
    years = Counter()
    for a in d:
        y = a.get("start_date_local", "")[:4] or "unknown"
        years[y] += 1
    return years


def get_previous_count_from_git() -> int | None:
    """从 git HEAD~ 拿上一次 commit 的 activities.json 计数"""
    try:
        result = subprocess.run(
            ["git", "show", "HEAD:src/static/activities.json"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None
        d = json.loads(result.stdout)
        return len(d) if isinstance(d, list) else 0
    except Exception as e:
        print(f"[warn] could not read HEAD version: {e}", file=sys.stderr)
        return None


def main():
    new_count = count_activities_in_file(JSON_PATH)
    print(f"[safety] current activities.json: {new_count} activities")

    prev_count = get_previous_count_from_git()
    if prev_count is None:
        print("[safety] no git history baseline, skip check")
        sys.exit(0)

    print(f"[safety] HEAD version: {prev_count} activities")

    if new_count >= prev_count:
        print(f"[safety] OK: new {new_count} >= old {prev_count} (no data loss)")
        sys.exit(0)

    drop_count = prev_count - new_count
    drop_ratio = drop_count / prev_count if prev_count > 0 else 0

    print(f"[safety] ⚠️  WARNING: activities dropped by {drop_count} ({drop_ratio:.1%})")

    if drop_count >= THRESHOLD_MIN_ABSOLUTE and drop_ratio >= THRESHOLD_DROP_RATIO:
        print(f"[safety] ❌ FAIL: drop {drop_ratio:.1%} >= {THRESHOLD_DROP_RATIO:.0%} threshold")
        print(f"[safety] 检查 sync 脚本是否覆盖了历史数据")
        print(f"[safety] 修法: python3 scripts/regen_activities_json.py  从 db 重生")

        # 输出年份 diff
        new_years = get_year_distribution(JSON_PATH)
        old_years = get_year_distribution_from_git()
        if old_years:
            print(f"[safety] 年份分布对比:")
            all_years = sorted(set(list(new_years.keys()) + list(old_years.keys())))
            for y in all_years:
                old_n = old_years.get(y, 0)
                new_n = new_years.get(y, 0)
                marker = " ⚠️ LOST" if new_n == 0 and old_n > 0 else ""
                print(f"  {y}: {old_n} → {new_n}{marker}")

        sys.exit(1)

    print(f"[safety] OK: drop within tolerance")
    sys.exit(0)


def get_year_distribution_from_git() -> Counter:
    try:
        result = subprocess.run(
            ["git", "show", "HEAD:src/static/activities.json"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return Counter()
        d = json.loads(result.stdout)
        years = Counter()
        for a in d:
            y = a.get("start_date_local", "")[:4] or "unknown"
            years[y] += 1
        return years
    except Exception:
        return Counter()


if __name__ == "__main__":
    main()
