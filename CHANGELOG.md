# 更新日志

所有值得注意的版本变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [未发布]

### 计划中
- 运动健康评估建议模块（HealthAssessment）
- 2024-09~2025-08 缺失数据期（Apple Watch 漏戴根因）

## [2.1.3] - 2026-06-12

### 修复 (Patch)
- **异常数据修复**：`run_page/generator/__init__.py` filter 强化
  - 防御 `distance IS NULL` 行漏过滤（`and_(distance > 0.1, distance.isnot(None))`）
  - 0 距离 Run 二次过滤（误触发 / Apple Watch 半路掉线）
  - 0 距离 Workout 保留不删（Keep API 漏 GPX，用户决策：丢数据更糟）
- **离线重生工具**：新增 `scripts/regen_activities_json.py`
  - 绕开 keep API 凭证依赖，本地可重生活动 JSON
  - 跟 `generator.load()` 同样 filter + streak 计算逻辑
  - 用途：本地调试 / yml runner cache miss / db 已更新但 json 未更新时手动同步

### 文档
- `.gitignore` 加 `src/static/activities.json.bak-*` 排除（regen 脚本会自动备份）

### 统计
- db: 584 条 / 7 年份 / 6 类型 (Run 455, RopeSkipping 37, StairStepper 33, Walk 29, Workout 19, Ride 7, Hiking 4)
- json: 562 条 / 7 年份 / 6 类型（filter 22 条：3 Run 0 距离 + 19 Workout 0 距离）

## [2.1.2] - 2026-06-12

### 修复 (Patch)
- T1.1: `YearStat` 组件按 sportKey 过滤（之前用 useActivities 全集，sidebar Total Journey 错显示 562 而非 452 Run）
- T1.3: `PeriodStat` 组件按 sportKey 过滤（之前跑步详情页时段分布混入爬楼/跳绳/步行/骑行/徒步条）

### 新增
- `useSportActivities(sportKey)` hook
- `getRunPeriodBySport(sportKey)` 函数
- 4 组件加 `sportKey` prop（PeriodStat / YearStat / LocationStat / index.tsx）
- 主页 `<LocationStat sportKey="Run" />` 显式传参

## [2.1.1] - 2026-03-04

### 发布
- Sports Fair 品牌重命名（fork of yihong0618/running_page）
- Vercel 部署优化
- 性能优化（Apple HIG 缓动曲线）
- 升级 vite-tsconfig-paths
- dependabot 关闭
- Vercel buildCommand 修复

[未发布]: https://github.com/wuleiyuan/sports-fair/compare/v2.1.3...HEAD
[2.1.3]: https://github.com/wuleiyuan/sports-fair/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/wuleiyuan/sports-fair/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/wuleiyuan/sports-fair/releases/tag/v2.1.1
