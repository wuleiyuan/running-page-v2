// 运动类型配置 - 中等改造第三阶段
// 兼容层全部走 sportCompat.ts，本文件只做 re-export + 兼容旧 import 路径
// 2026-06-08 重构：把 6 大类型 → 20+ 桶（用户要求"项目支持的全要"+ 兼容性）

import {
  SPORT_COMPAT as _SPORT_COMPAT,
  SPORT_COMPAT_BY_KEY as _SPORT_BY_KEY,
  normalizeSportTypeCompat,
  getSportCompatConfig,
  type SportCompat as SportTypeConfig,
} from './sportCompat';

// 旧 API 兼容（保证 main.tsx / 其他老代码不挂）
export type { SportCompat as SportTypeConfig } from './sportCompat';

/** 20+ 桶（覆盖项目支持的全部运动类型） */
export const SPORT_TYPES: SportTypeConfig[] = _SPORT_COMPAT;

/** URL key → config 快查 */
export const SPORT_BY_KEY: Record<string, SportTypeConfig> = _SPORT_BY_KEY;

/** 兼容：从老数据中归一化 type 字段（统一走 sportCompat 兼容层） */
export function normalizeSportType(
  rawType: string | null | undefined,
  name?: string | null
): string {
  return normalizeSportTypeCompat(rawType, name);
}

/** 单个活动的运动类型 config */
export function getSportConfig(
  rawType: string | null | undefined,
  name?: string | null
): SportTypeConfig {
  return getSportCompatConfig(rawType, name);
}
