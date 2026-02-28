#VB|# 开发日志 (Development Log)
#KM|
#WQ|## [2026-02-28] v2.1.1 数据同步：从 v1 导入 Apple Watch 跑步数据
#WX|### 背景
#YM|- 同步 wuleiyuan.github.io (v1) 项目中的 Apple Watch 跑步数据至 v2 项目。
#BQ|- 数据源为 Apple Watch 导出的 Excel 文件，包含 380 条历史跑步记录。
#HN|
#VH|### 同步内容
#KJ|1. **数据库同步**：将 v1 的 `scripts/data.db` 复制至 v2 的 `run_page/data.db`。
#HX|2. **前端数据同步**：将 v1 的 `src/static/activities.json` 复制至 v2 对应位置（更新至 804 条记录）。
#XH|3. **SVG 图片重新生成**：
#TZ|   - year_2020.svg (~102 tracks)
#VZ|   - year_2021.svg (~97 tracks)
#MX|   - year_2022.svg (~131 tracks)
#RJ|   - year_2023.svg (~70 tracks)
#WN|   - year_2024.svg (~18 tracks)
#YK|   - github.svg (793 tracks)
#KS|   - github_2022.svg, github_2023.svg, github_2024.svg
#VS|
#BY|### 数据统计
#TH|- 总活动数：804 条
#YV|- 新增记录：380 条（来自 Apple Watch Excel 导出）
#VH|- 数据覆盖：2020-2024 年

# 开发日志 (Development Log)

## [2026-02-28] v2.1.0 重大重构：去除 Mapbox 依赖，全面拥抱 MapLibre
### 核心问题
- 原有框架高度依赖 Mapbox，导致在 Vercel 部署时频繁遭遇 CORS 跨域错误和 Token 验证失败拦截。
- `react-map-gl` 哪怕是在使用其他免 Token 的瓦片源时，其底层仍然强制需要 Mapbox Token。

### 解决路径
1. **替换底层库**：在 `package.json` 中移除了原生的 `mapbox-gl`，替换为开源免费分支 `maplibre-gl` (v3.6.2)。
2. **适配 React 组件**：将引入组件（如 Map, Layer, Marker 等）的路径统一从 `react-map-gl` 改为兼容易用的 `react-map-gl/maplibre`。
3. **剔除残留项**：
   - 彻底移除了 `MapboxLanguage` 等专属控件的引用。
   - 删除了 `<Map>` 组件中绑定的 `mapboxAccessToken` 属性以杜绝后台追踪（Telemetry）请求发往 events.mapbox.com。
4. **更换地图源**：配置 `MAP_TILE_VENDOR = 'mapcn'` 以及设置 `MAP_TILE_ACCESS_TOKEN = ''`，使用免 Key 的免费地图底图（如 `osm-bright`）。

### 部署修复
- 修复了因为直接手动修改 `package.json` 但未同步更新 `pnpm-lock.yaml` 导致 Vercel 触发 `ERR_PNPM_OUTDATED_LOCKFILE` 的致命构建失败。

### 总结
当前项目已经**100%剥离了 Mapbox 的商业限制**，成为一个可以零配置、免 API Key、一键部署上线的纯开源数据可视化大屏展示方案。
