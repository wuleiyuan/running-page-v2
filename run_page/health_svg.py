"""
健康分析 SVG 生成器（health_svg.py）

读 records 表 → 4 个面板的 dashboard SVG（HR / HRV / Steps / Sleep）
输出 assets/health.svg

设计：
  画布 1280x800，2x2 grid
  左上: HR 热力图（GitHub style，按天强度：灰→蓝→红）
  右上: HRV 热力图（每日 SDNN 均值，灰→绿渐变）
  左下: 步数柱状图（按月汇总）
  右下: 睡眠堆叠柱状图（深/REM/Core，按月）

颜色参考 running-page v2 主题：
  背景 #0d1117（GitHub dark）
  文字 #c9d1d9
  强调 #4DD2FF（跑步主题色）
"""

import argparse
import datetime as dt
import os
import sys
from collections import defaultdict
from pathlib import Path

import svgwrite

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config import SQL_FILE  # noqa: E402
from generator.db import init_db, Record  # noqa: E402

# 颜色主题
BG = "#0d1117"
PANEL_BG = "#161b22"
TEXT = "#c9d1d9"
SUBTEXT = "#8b949e"
ACCENT = "#4DD2FF"
GRID = "#30363d"

# HR 热力图分级（GitHub 风格 5 级）
# bpm: <60 灰 / 60-90 浅蓝 / 90-120 蓝 / 120-150 黄 / >150 红
HR_COLORS = {
    0: "#161b22",  # 无数据
    1: "#1f3a5f",  # <60 休息
    2: "#2e5984",  # 60-90
    3: "#3d8bda",  # 90-120
    4: "#f0a830",  # 120-150
    5: "#e74c3c",  # >150
}


def hr_level(bpm):
    if bpm is None:
        return 0
    if bpm < 60:
        return 1
    if bpm < 90:
        return 2
    if bpm < 120:
        return 3
    if bpm < 150:
        return 4
    return 5


# HRV 渐变（低→高）
HRV_COLORS = {
    0: "#161b22",
    1: "#1e3a2e",  # <20
    2: "#2e6b4f",  # 20-40
    3: "#5fb878",  # 40-60
    4: "#9be37a",  # 60-80
    5: "#d4f576",  # >80
}


def hrv_level(ms):
    if ms is None:
        return 0
    if ms < 20:
        return 1
    if ms < 40:
        return 2
    if ms < 60:
        return 3
    if ms < 80:
        return 4
    return 5


def date_key(date_str):
    return date_str[:10] if date_str else None


def aggregate(session):
    """聚合 records → 4 类 daily data"""
    print("📊 聚合 records ...")
    by_date = defaultdict(lambda: {"hr": [], "hrv": [], "steps": 0, "sleep": defaultdict(float)})

    for rec in session.query(Record).yield_per(50000):
        d = date_key(rec.start_date)
        if not d:
            continue
        if rec.record_type == "HeartRate" and rec.value is not None:
            by_date[d]["hr"].append(rec.value)
        elif rec.record_type == "HRV" and rec.value is not None:
            by_date[d]["hrv"].append(rec.value)
        elif rec.record_type == "StepCount" and rec.value is not None:
            by_date[d]["steps"] += rec.value
        elif rec.record_type == "SleepAnalysis" and rec.value:
            cat = rec.category or ""
            by_date[d]["sleep"][cat] += rec.value
            # 算所有 Asleep* 段（包括 Unspec），但单段 >12h 视为异常丢弃
            if cat.startswith("Asleep") and rec.value <= 12 * 3600:
                by_date[d]["sleep_total_sec"] = by_date[d].get("sleep_total_sec", 0) + rec.value

    # 计算 daily 聚合
    daily = {}
    for d, data in by_date.items():
        entry = {}
        if data["hr"]:
            entry["hr_mean"] = sum(data["hr"]) / len(data["hr"])
        if data["hrv"]:
            entry["hrv_mean"] = sum(data["hrv"]) / len(data["hrv"])
        if data["steps"] > 0:
            entry["steps"] = int(data["steps"])
        sl = data.get("sleep_total_sec", 0)
        if 0 < sl <= 16 * 3600:  # 过滤异常
            entry["sleep_hours"] = sl / 3600
            entry["sleep_deep"] = data["sleep"].get("AsleepDeep", 0) / 3600
            entry["sleep_rem"] = data["sleep"].get("AsleepREM", 0) / 3600
            entry["sleep_core"] = data["sleep"].get("AsleepCore", 0) / 3600
        daily[d] = entry

    print(f"   {len(daily)} 天有数据")
    return daily


def draw_hr_heatmap(dwg, x0, y0, w, h, daily):
    """HR 热力图（GitHub style）"""
    # 标题
    dwg.add(dwg.text("❤️ 心率 (bpm)", insert=(x0 + 10, y0 + 20), fill=TEXT,
                     style="font-size:18px; font-weight:600; font-family:Arial"))

    if not daily:
        return

    # 按年分行
    by_year = defaultdict(dict)
    for d, data in daily.items():
        if "hr_mean" in data:
            by_year[d[:4]][d] = data["hr_mean"]

    years = sorted(by_year.keys())
    if not years:
        return

    # 取最近 4 年（让用户能看到2023 的中后期 + 整个 2024-2026）
    years = years[-4:] if len(years) > 4 else years
    panel_inner_w = w - 30
    # 自适应 cell_size：让 3 年都装下
    # 53 weeks/year * (cell + gap) * n_years + (n_years-1) * 30 year_gap = panel_inner_w
    n_years = len(years)
    avail_for_cells = panel_inner_w - (n_years - 1) * 30
    weeks_total = 53 * n_years
    # cell+gap ≤ avail_for_cells / weeks_total
    max_cell_plus_gap = avail_for_cells / weeks_total
    cell_size = max(4, min(11, int(max_cell_plus_gap) - 1))
    gap = 1
    week_w = cell_size + gap
    months_per_row = 12

    inner_x = x0 + 10
    inner_y = y0 + 50
    max_year_w = 53 * week_w
    total_w = min(w - 20, max_year_w * len(years) + (len(years) - 1) * 30)

    # 网格
    for yi, year in enumerate(years):
        ydata = by_year[year]
        # 全年日期
        start = dt.date(int(year), 1, 1)
        end = dt.date(int(year), 12, 31)
        cur = start
        year_x = inner_x + yi * (53 * week_w + 30)
        year_y = inner_y + 20

        # 年份 label
        dwg.add(dwg.text(year, insert=(year_x, year_y - 5), fill=TEXT,
                         style="font-size:12px; font-family:Arial"))

        # 计算首日偏移
        first_weekday = start.weekday()  # Mon=0

        while cur <= end:
            days_from_start = (cur - start).days
            week_idx = (days_from_start + first_weekday) // 7
            weekday = (days_from_start + first_weekday) % 7
            cx = year_x + week_idx * week_w
            cy = year_y + weekday * week_w

            d_str = cur.isoformat()
            bpm = ydata.get(d_str)
            level = hr_level(bpm)
            color = HR_COLORS[level]

            dwg.add(dwg.rect((cx, cy), (cell_size, cell_size), fill=color, rx=2))

            cur += dt.timedelta(days=1)

    # 图例
    legend_x = x0 + 10
    legend_y = y0 + h - 20
    dwg.add(dwg.text("少", insert=(legend_x, legend_y + 10), fill=SUBTEXT,
                     style="font-size:10px; font-family:Arial"))
    for i in range(1, 6):
        dwg.add(dwg.rect((legend_x + 25 + (i - 1) * 14, legend_y + 2), (11, 11), fill=HR_COLORS[i], rx=2))
    dwg.add(dwg.text("多", insert=(legend_x + 25 + 5 * 14 + 4, legend_y + 10), fill=SUBTEXT,
                     style="font-size:10px; font-family:Arial"))


def draw_hrv_heatmap(dwg, x0, y0, w, h, daily):
    """HRV 热力图"""
    dwg.add(dwg.text("💚 HRV (ms)", insert=(x0 + 10, y0 + 20), fill=TEXT,
                     style="font-size:18px; font-weight:600; font-family:Arial"))

    by_year = defaultdict(dict)
    for d, data in daily.items():
        if "hrv_mean" in data:
            by_year[d[:4]][d] = data["hrv_mean"]

    years = sorted(by_year.keys())[-4:] if len(sorted(by_year.keys())) > 4 else sorted(by_year.keys())
    if not years:
        return

    cell_size = 8
    week_w = cell_size + 1
    panel_inner_w = w - 30
    n_years = len(years)
    avail_for_cells = panel_inner_w - (n_years - 1) * 30
    weeks_total = 53 * n_years
    max_cell_plus_gap = avail_for_cells / weeks_total
    cell_size = max(4, min(11, int(max_cell_plus_gap) - 1))
    week_w = cell_size + 1
    inner_x = x0 + 10
    inner_y = y0 + 50

    for yi, year in enumerate(years):
        ydata = by_year[year]
        start = dt.date(int(year), 1, 1)
        end = dt.date(int(year), 12, 31)
        first_weekday = start.weekday()
        cur = start
        year_x = inner_x + yi * (53 * week_w + 30)
        year_y = inner_y + 20

        dwg.add(dwg.text(year, insert=(year_x, year_y - 5), fill=TEXT,
                         style="font-size:12px; font-family:Arial"))

        while cur <= end:
            days_from_start = (cur - start).days
            week_idx = (days_from_start + first_weekday) // 7
            weekday = (days_from_start + first_weekday) % 7
            cx = year_x + week_idx * week_w
            cy = year_y + weekday * week_w

            level = hrv_level(ydata.get(cur.isoformat()))
            dwg.add(dwg.rect((cx, cy), (cell_size, cell_size), fill=HRV_COLORS[level], rx=2))
            cur += dt.timedelta(days=1)

    # 图例
    legend_x = x0 + 10
    legend_y = y0 + h - 20
    dwg.add(dwg.text("低", insert=(legend_x, legend_y + 10), fill=SUBTEXT,
                     style="font-size:10px; font-family:Arial"))
    for i in range(1, 6):
        dwg.add(dwg.rect((legend_x + 20 + (i - 1) * 14, legend_y + 2), (11, 11), fill=HRV_COLORS[i], rx=2))
    dwg.add(dwg.text("高", insert=(legend_x + 20 + 5 * 14 + 4, legend_y + 10), fill=SUBTEXT,
                     style="font-size:10px; font-family:Arial"))


def draw_steps_bars(dwg, x0, y0, w, h, daily):
    """步数按月柱状图"""
    dwg.add(dwg.text("👟 每日步数", insert=(x0 + 10, y0 + 20), fill=TEXT,
                     style="font-size:18px; font-weight:600; font-family:Arial"))

    # 按月聚合（每天取均值）
    by_year_month = defaultdict(list)
    for d, data in daily.items():
        if "steps" in data:
            ym = d[:7]
            by_year_month[ym].append(data["steps"])

    if not by_year_month:
        return

    months = sorted(by_year_month.keys())
    means = [sum(by_year_month[m]) / len(by_year_month[m]) for m in months]
    max_val = max(means) if means else 1

    # 画图
    inner_x = x0 + 50
    inner_y = y0 + 50
    inner_w = w - 70
    inner_h = h - 100

    # y 轴 grid
    for i in range(0, 5):
        gy = inner_y + inner_h - i * inner_h / 4
        gv = int(max_val * i / 4)
        dwg.add(dwg.line((inner_x, gy), (inner_x + inner_w, gy), stroke=GRID, stroke_width=0.5))
        dwg.add(dwg.text(f"{gv:,}", insert=(inner_x - 45, gy + 3), fill=SUBTEXT,
                         style="font-size:10px; font-family:Arial"))

    # 柱
    bar_w = max(2, inner_w / len(months) - 1)
    for i, (m, v) in enumerate(zip(months, means)):
        bx = inner_x + i * (bar_w + 1)
        bh = v / max_val * inner_h
        by = inner_y + inner_h - bh
        dwg.add(dwg.rect((bx, by), (bar_w, bh), fill=ACCENT, rx=1))
        # x label 每年第一个月
        if m.endswith("-01"):
            dwg.add(dwg.text(m[:4], insert=(bx, inner_y + inner_h + 15), fill=SUBTEXT,
                             style="font-size:10px; font-family:Arial"))


def draw_sleep_bars(dwg, x0, y0, w, h, daily):
    """睡眠按月堆叠柱状图（深/REM/Core）"""
    dwg.add(dwg.text("😴 每日睡眠 (h)", insert=(x0 + 10, y0 + 20), fill=TEXT,
                     style="font-size:18px; font-weight:600; font-family:Arial"))

    by_year_month = defaultdict(lambda: {"deep": [], "rem": [], "core": []})
    for d, data in daily.items():
        if "sleep_hours" in data:
            ym = d[:7]
            by_year_month[ym]["deep"].append(data.get("sleep_deep", 0))
            by_year_month[ym]["rem"].append(data.get("sleep_rem", 0))
            by_year_month[ym]["core"].append(data.get("sleep_core", 0))

    if not by_year_month:
        return

    def median(vals):
        if not vals:
            return 0
        s = sorted(vals)
        n = len(s)
        return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2

    months = sorted(by_year_month.keys())
    deep_means = [median(by_year_month[m]["deep"]) for m in months]
    rem_means = [median(by_year_month[m]["rem"]) for m in months]
    core_means = [median(by_year_month[m]["core"]) for m in months]
    totals = [d + r + c for d, r, c in zip(deep_means, rem_means, core_means)]
    max_val = max(totals) if totals else 10

    inner_x = x0 + 50
    inner_y = y0 + 50
    inner_w = w - 70
    inner_h = h - 100

    # y 轴 grid
    for i in range(0, 5):
        gy = inner_y + inner_h - i * inner_h / 4
        gv = max_val * i / 4
        dwg.add(dwg.line((inner_x, gy), (inner_x + inner_w, gy), stroke=GRID, stroke_width=0.5))
        dwg.add(dwg.text(f"{gv:.1f}h", insert=(inner_x - 40, gy + 3), fill=SUBTEXT,
                         style="font-size:10px; font-family:Arial"))

    bar_w = max(2, inner_w / len(months) - 1)
    colors = {"deep": "#3d5a80", "rem": "#98c1d9", "core": "#e0fbfc"}
    for i, (m, d_, r_, c_) in enumerate(zip(months, deep_means, rem_means, core_means)):
        bx = inner_x + i * (bar_w + 1)
        total = d_ + r_ + c_
        if total <= 0:
            continue  # 跳过无数据月
        scale = total / max_val * inner_h
        # 堆叠：core 在底，deep 中，rem 上
        y_core = inner_y + inner_h - c_ / total * scale
        dwg.add(dwg.rect((bx, y_core), (bar_w, c_ / total * scale), fill=colors["core"], rx=1))
        y_deep = y_core - d_ / total * scale
        dwg.add(dwg.rect((bx, y_deep), (bar_w, d_ / total * scale), fill=colors["deep"], rx=1))
        y_rem = y_deep - r_ / total * scale
        dwg.add(dwg.rect((bx, y_rem), (bar_w, r_ / total * scale), fill=colors["rem"], rx=1))

        if m.endswith("-01"):
            dwg.add(dwg.text(m[:4], insert=(bx, inner_y + inner_h + 15), fill=SUBTEXT,
                             style="font-size:10px; font-family:Arial"))

    # 图例
    legend_y = inner_y + inner_h + 30
    legend_items = [("Deep", colors["deep"]), ("REM", colors["rem"]), ("Core", colors["core"])]
    for label, color in legend_items:
        idx = legend_items.index((label, color))
        lx = inner_x + idx * 60
        dwg.add(dwg.rect((lx, legend_y), (10, 10), fill=color, rx=1))
        dwg.add(dwg.text(label, insert=(lx + 14, legend_y + 9), fill=TEXT,
                         style="font-size:10px; font-family:Arial"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(PROJECT_ROOT / "assets" / "health.svg"))
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=800)
    args = parser.parse_args()

    session = init_db(str(SQL_FILE))
    daily = aggregate(session)

    if not daily:
        print("⚠️  没有数据")
        return 1

    # 找时间范围
    dates = sorted(daily.keys())
    print(f"📅 {dates[0]} → {dates[-1]}")

    dwg = svgwrite.Drawing(args.output, size=(args.width, args.height), viewBox=f"0 0 {args.width} {args.height}")
    dwg.add(dwg.rect((0, 0), (args.width, args.height), fill=BG))

    # 顶部 header
    dwg.add(dwg.text("WuLeiYuan 健康分析", insert=(20, 35), fill=TEXT,
                     style="font-size:24px; font-weight:600; font-family:Arial"))
    dwg.add(dwg.text(f"数据范围 {dates[0]} → {dates[-1]}  ·  {len(daily)} 天有数据",
                     insert=(20, 60), fill=SUBTEXT,
                     style="font-size:12px; font-family:Arial"))

    # 2x2 grid
    panel_w = args.width / 2 - 10
    panel_h = (args.height - 80) / 2 - 10

    # 左上：HR
    dwg.add(dwg.rect((5, 75), (panel_w, panel_h), fill=PANEL_BG, rx=8))
    draw_hr_heatmap(dwg, 5, 75, panel_w, panel_h, daily)

    # 右上：HRV
    dwg.add(dwg.rect((args.width / 2 + 5, 75), (panel_w, panel_h), fill=PANEL_BG, rx=8))
    draw_hrv_heatmap(dwg, args.width / 2 + 5, 75, panel_w, panel_h, daily)

    # 左下：Steps
    dwg.add(dwg.rect((5, 75 + panel_h + 10), (panel_w, panel_h), fill=PANEL_BG, rx=8))
    draw_steps_bars(dwg, 5, 75 + panel_h + 10, panel_w, panel_h, daily)

    # 右下：Sleep
    dwg.add(dwg.rect((args.width / 2 + 5, 75 + panel_h + 10), (panel_w, panel_h), fill=PANEL_BG, rx=8))
    draw_sleep_bars(dwg, args.width / 2 + 5, 75 + panel_h + 10, panel_w, panel_h, daily)

    dwg.save()
    print(f"✅ 写入 {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())