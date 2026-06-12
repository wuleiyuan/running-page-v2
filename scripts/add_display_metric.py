#!/usr/bin/env python3
"""
给 sportCompat.ts 所有 21 个桶批量加 displayMetric + unitLabel 字段。
每桶按其语义决定 displayMetric:
  - distance: Run / Hiking / Walk / Ride / Swim / Elliptical / Skiing / Surfing / Wheelchair
  - count:    StairStepper / RopeSkipping / Boxing / Soccer / Basketball / Tennis
  - duration: Strength / Core / Yoga
  - duration: Other (兜底)

写入每个 `},` 之前，在 `desc: 'xxx',` 后加新字段。
"""
import re
import sys

PATH = "/Users/leiyuanwu/LocalProjects/run_page/running-page-v2/src/utils/sportCompat.ts"

# 桶 -> (displayMetric, unitLabel) 映射
METRIC_MAP = {
    "Run":          ("distance", "km"),
    "Hiking":       ("distance", "km"),
    "Walk":         ("distance", "km"),
    "Ride":         ("distance", "km"),
    "Swim":         ("distance", "m"),       # 游泳按 m
    "Strength":     ("duration", "min"),     # 力量训练按时长
    "Core":         ("duration", "min"),
    "Yoga":         ("duration", "min"),
    "Elliptical":   ("distance", "km"),
    "StairStepper": ("count",    "层"),       # 爬楼按层数
    "Rowing":       ("distance", "m"),       # 划船机按 m 或 duration
    "Boxing":       ("count",    "组"),       # 拳击按组数
    "RopeSkipping": ("count",    "次"),       # 跳绳按次数
    "Soccer":       ("count",    "次"),       # 足球按触球/射门
    "Basketball":   ("count",    "次"),       # 篮球按投篮
    "Tennis":       ("count",    "次"),       # 网球按挥拍
    "Skiing":       ("distance", "km"),
    "Surfing":      ("distance", "km"),
    "Golf":         ("count",    "洞"),       # 高尔夫按洞数
    "Wheelchair":   ("distance", "km"),
    "Other":        ("duration", "min"),
}


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()

    # 在每个 key: 'X', 行后找到 desc: 'Y', 行，在其后插入新字段
    # 用正则块匹配: key ... desc ...
    pattern = re.compile(
        r"(key: '([A-Z][a-zA-Z]+)',)(.*?)(desc: '[^']*',)",
        re.DOTALL,
    )

    def replace(m: re.Match) -> str:
        key_full, key_name, between, desc_full = m.groups()
        if key_name not in METRIC_MAP:
            return m.group(0)  # 不动
        if "displayMetric:" in between:
            return m.group(0)  # 已有，跳过
        display, unit = METRIC_MAP[key_name]
        return (
            f"{key_full}{between}{desc_full}\n"
            f"    displayMetric: '{display}',\n"
            f"    unitLabel: '{unit}',"
        )

    new_src = pattern.sub(replace, src)

    # 统计改了哪些
    changed = re.findall(r"displayMetric: '(\w+)'", new_src)
    print(f"已加 displayMetric: {len(changed)} 个桶")
    print(f"分布: {dict((k, changed.count(k)) for k in set(changed))}")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(new_src)


if __name__ == "__main__":
    main()
