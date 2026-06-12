# 更新日志

所有值得注意的版本变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [未发布]

### 计划中
- 2024-09~2025-08 缺失数据期（Apple Watch 漏戴根因）
- 训练强度（HR / 配速）维度纳入训练负荷评估

## [2.1.9] - 2026-06-12

### 新增 (UI 重构：按 Gemini 设计稿)
- **assessTrainingLoad** 改用 Banister TRIMP 替代单纯时长，TRIMP 优先用 average_heartrate 算强度权重，无则降级为 duration × 1.0
- **assessTrainingLoad** 返回 { card, trend }，trend 数组保留供 v2.2.0 进一步使用
- **AssessmentBundle** 新增 `trainingLoadTrend?: number[]` 字段
- **AssessmentCard** 训练负荷卡片显示 **ACWR 区间色带**（4 段：恢复期紫/最佳提升绿/过度训练橙/高危预警蓝）+ 位置圆点 + 状态评级标签 + 静态 AI 教练建议
- **acwrZone()** 函数：根据 ACWR ratio 返回当前区间 + 业务级建议（维持训练/减量 20%/减量 50% 等）
- **ACWR 风险区间色带** 全新 CSS（色带 + 标签 + 位置圆点 + 状态标签）
- 推翻前一版"7 天柱状图"设计（信息量低），改用 Gemini 设计稿的"区间色带 + 业务评级"方案

### 算法细节
- TRIMP 公式: T = duration_min × 0.64 × exp(1.92 × intensity)
- intensity = clamp((avgHR - hrRest) / (hrMax - hrRest), 0, 1)
- hrMax 近似 = top_stats.hr.max_ever (fallback 190)
- hrRest 近似 = top_stats.rhr.median (fallback 60)
- ACWR = acute7d / chronic28d，chronic = 28 天日均 × 7

### 已知局限
- TRIMP 强度依赖 average_heartrate，活动缺此字段时降级为 duration×1.0（保守）
- hrMax / hrRest 是基于历史估算，不是个人精确值（理想需 Apple Watch 用户输入最大心率）

## [2.1.8] - 2026-06-12

### 修复
- **scripts/bump_version.sh** 加 `-y/--yes` 自动模式：自动 git add + commit + tag + push
- **scripts/bump_version.sh** 注释更新：明确说明"没 tag = GitHub Releases 看不到版本"
- **scripts/bump_version.sh** 改后输出重写：手工模式只列 4 必做步 + 提示用 `-y` 自动化
- **PROJECT_NOTES.md** §版本号流程 第 4 步改为 "git tag + push" 必做（原写"GitHub UI 发 release"是可选的）
- **PROJECT_NOTES.md** §版本号流程 加 "历史教训"段：v2.1.1-2.1.7 漏 tag 教训

### 回填
- **git tag v2.1.2 / v2.1.3 / v2.1.4 / v2.1.5 / v2.1.6 / v2.1.7** 6 个 tag 全部补打 + push（不回填 release，按用户决策先修根因，下次 bump 自动）
- **PROJECT_NOTES.md** §版本号流程注释明确："公开文档但本地不入仓"（避免误暴露异常数据现状）

## [2.1.7] - 2026-06-12

### 修复
- **health_stats.py** HR / RHR / HRV 收集时过滤异常值（HR 30-220 / RHR 30-120 / HRV 10-200）
- **health_stats.py** 睡眠过滤改为 1-14h（原本 16h 上限过松，午睡 < 1h 也过滤）
- **health_stats.py** `compute_top_stats` 收集时同步加合理性过滤
- **health.tsx** `safeByYear` useMemo 客户端异常值防御（双保险，根因在 health_stats.py 需重跑脚本）
- **CHANGELOG** 标记 2.1.7 需手动重跑 `python3 run_page/health_stats.py` 才能让 health_stats.json 实际生效

## [2.1.6] - 2026-06-12

### 修复
- **assessHRV** 支持 7/30 天窗口 + 文案明确标注"全量均值"+ 提示开启 Apple Watch HRV 日级测量
- **assessRHR** 过滤异常值（RHR < 30 数据缺失 / > 120 异常高）
- **assessSleep** 过滤异常值（< 1h 手环未戴 / > 14h 未摘表）
- **assessSteps** 过滤负值（防御性）
- **AssessmentCard** advice 区块显式 `color: #1a1a1a` + `font-weight: 500` 修复亮底深字对比度
- **style.module.css** `.switchBtn.active` 加 `font-weight: 600` + `box-shadow` 增强 7/30 切换高亮

## [2.1.5] - 2026-06-12

### 新增 (Minor)
- **健康评估建议模块 UI 完整** (路由 `/health-assess`)
  - `src/components/HealthAssessment/AssessmentCard.tsx` - 单卡片（5 个共用）
  - `src/components/HealthAssessment/SeverityBadge.tsx` - 严重程度徽章（良好/关注/警告/紧急）
  - `src/pages/health-assess.tsx` - 路由页（含 7 天/30 天切换）
  - `src/pages/style.module.css` - 评估页专用样式
  - `src/components/Header/index.tsx` - 顶部导航新增 🩺 评估建议 链接（同时加 📊 旅程总览、💚 健康分析）
  - `src/main.tsx` - 路由注册
- **vitest 测试框架引入**
  - `vitest.config.ts` - vitest + tsconfigPaths 配置
  - `src/utils/__tests__/healthAssessment.test.ts` - 7 个 describe 块
  - `src/utils/__tests__/activitiesDisplay.test.ts` (v2.1.4 已有)
  - `package.json` scripts: `test` / `test:watch` / `ci` 链路加 `test` 步骤
  - `package.json` devDeps: `vitest@^3.2.4`
- **文档 `HEALTH_ASSESSMENT.md`** - 用户视角 + 算法说明 + 数据局限 + 4 段医学/运动科学依据

### 算法依据
- RHR：AHA 静息心率分级（优秀 < 60 / 良好 60-64 / 一般 65-69 / 偏高 70-79）
- HRV：Apple Heart Rate Study + Kubios 公开数据（高 > 50ms / 中 30-50ms / 低 < 30ms）
- 睡眠：NSF 建议（7-9h 充足 / 6-7h 略少 / < 6h 不足）
- 步数：WHO + 主流 App 共识（10000+ 优秀 / 7000-10000 良好 / 4000-7000 偏低 / < 4000 久坐）
- 训练负荷（ACWR）：acute:chronic workload ratio 公开论文（0.8-1.3 安全 / 1.3-1.5 警戒 / > 1.5 危险）

## [2.1.4] - 2026-06-12

### 新增 (Minor)
- **运动类型显示维度重构**：根据运动语义，UI 不再统一显示距离
  - `distance` (位移)：Run / Hiking / Walk / Ride / Swim / Elliptical / Skiing / Surfing / Wheelchair
  - `count` (计数)：StairStepper / RopeSkipping / Boxing / Soccer / Basketball / Tennis / Golf
  - `duration` (时长)：Strength / Core / Yoga / Workout
  - 22 个 sportCompat 桶加 `displayMetric` + `unitLabel` 字段
- **新增 `src/utils/activitiesDisplay.ts`**：
  - `getDisplayMetric(activity)` 返回 `{label, value, subLabel, subValue, anomaly}`
  - `aggregateDisplayMetric(activities[])` 批量聚合（sidebar / 主页用）
  - 防御性异常检测：0 距离 + 长时长 / Run 速度 < 1 km/h / Run 速度 > 30 km/h
- **新增 `src/utils/healthAssessment.ts`** (5 个评估函数 + 类型) — UI 留待 2.1.5
- **新增单元测试** `src/utils/__tests__/activitiesDisplay.test.ts` (vitest 框架，下版本引入)
- **异常数据视觉提示**：`RunRow.tsx` 加 `warning` / `error` 样式（黄/红左边框 + tooltip）

### 修复 (Patch)
- **异常数据 filter 加强** `run_page/generator/__init__.py`：
  - Run 速度 < 1 km/h 持续 > 1h 跳过（卡死/误触发）
  - Run 速度 > 30 km/h 持续 > 5min 跳过（接近短跑极限但持续不可能是跑步）
  - 任意 type 0 距离 + 长时长（> 1h）跳过（数据损坏）
  - 防御性 `_moving_time_to_seconds()` helper 支持 timedelta/str/无值
  - 每次跑加 skipped 计数日志

### UI 改动
- `RunTable/RunRow.tsx`：第二列从 "距离" 改为 `display.value`（距离/次数/时长自适应）
- `RunTable/style.module.css`：加 `.warning` / `.error` 样式
- `sportCompat.ts`：22 桶加 `displayMetric` + `unitLabel`

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
