// 运动类型配置 - 中等改造：人生运动总览
// 来源：keep_sync.py KEEP2STRAVA 映射 + Apple HealthKit 类型

export interface SportTypeConfig {
  /** 英文键（用于路由 / URL） */
  key: string;
  /** 中文显示名 */
  label: string;
  /** 英文显示名 */
  labelEn: string;
  /** emoji 图标（首页卡片用） */
  emoji: string;
  /** 配色（暗色主题下的冷色调，运动感） */
  color: string;
  /** 浅色背景 */
  colorLight: string;
  /** 浅色变体（首页卡片背景用） */
  colorBg: string;
  /** 单位偏好（跑步/徒步用 km，游泳用 m） */
  unit: 'km' | 'mi' | 'm';
  /** 是否启用（暂时都开） */
  enabled: boolean;
  /** 描述（首页副标题） */
  desc: string;
}

/**
 * 6 大运动类型 - 中等改造首版
 * 配色用冷色调（蓝/青/紫/绿），呼应暗色主题
 * 颜色都在 const.ts 用暗色变量定义，这里直接用 hex
 */
export const SPORT_TYPES: SportTypeConfig[] = [
  {
    key: 'Run',
    label: '跑步',
    labelEn: 'Running',
    emoji: '🏃',
    color: '#5eb0ff',        // 冷蓝
    colorLight: '#a8d4ff',
    colorBg: 'rgba(94, 176, 255, 0.12)',
    unit: 'km',
    enabled: true,
    desc: '从街道到山野的每一步',
  },
  {
    key: 'Hiking',
    label: '徒步',
    labelEn: 'Hiking',
    emoji: '🥾',
    color: '#7dd3a8',        // 冷绿
    colorLight: '#b8e6ce',
    colorBg: 'rgba(125, 211, 168, 0.12)',
    unit: 'km',
    enabled: true,
    desc: '翻过的每一座山、踩过的每一条路',
  },
  {
    key: 'Walk',
    label: '步行',
    labelEn: 'Walking',
    emoji: '🚶',
    color: '#94a3b8',        // 灰蓝
    colorLight: '#cbd5e1',
    colorBg: 'rgba(148, 163, 184, 0.12)',
    unit: 'km',
    enabled: true,
    desc: '日常的每一步',
  },
  {
    key: 'Ride',
    label: '骑行',
    labelEn: 'Cycling',
    emoji: '🚴',
    color: '#c084fc',        // 冷紫
    colorLight: '#d8b4fe',
    colorBg: 'rgba(192, 132, 252, 0.12)',
    unit: 'km',
    enabled: true,
    desc: '两轮上的距离',
  },
  {
    key: 'VirtualRun',
    label: '室内跑',
    labelEn: 'Indoor Run',
    emoji: '🏃‍♂️',
    color: '#fbbf24',        // 暗金（区分户外跑）
    colorLight: '#fde68a',
    colorBg: 'rgba(251, 191, 36, 0.12)',
    unit: 'km',
    enabled: true,
    desc: '跑步机上的公里数',
  },
  {
    key: 'Other',
    label: '其他',
    labelEn: 'Other',
    emoji: '⚡',
    color: '#94a3b8',
    colorLight: '#cbd5e1',
    colorBg: 'rgba(148, 163, 184, 0.08)',
    unit: 'km',
    enabled: true,
    desc: '其他运动记录',
  },
];

/** URL key → config 快查 */
export const SPORT_BY_KEY: Record<string, SportTypeConfig> = SPORT_TYPES.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<string, SportTypeConfig>
);

/** 兼容：从老数据中归一化 type 字段 */
/** 老的 db 里所有 type 都是 "Run"，但 keep_sync 已经知道多种类型 */
export function normalizeSportType(rawType: string | null | undefined): string {
  if (!rawType) return 'Other';
  const t = rawType.trim();
  // 老数据全归 Run
  if (t === 'Run') return 'Run';
  // Apple HealthKit 类型
  if (t === 'HKWorkoutTypeIdentifier') return 'Other';
  if (t === 'Walking' || t === 'walk') return 'Walk';
  if (t === 'Running' || t === 'run') return 'Run';
  if (t === 'Cycling' || t === 'ride') return 'Ride';
  if (t === 'Hiking' || t === 'hiking') return 'Hiking';
  if (t === 'Mountaineering' || t === 'mountaineering') return 'Hiking';
  // Strava / keep_sync 的
  if (t === 'VirtualRun' || t === 'indoorRunning') return 'VirtualRun';
  if (t === 'Ride' || t === 'outdoorCycling') return 'Ride';
  if (t === 'Walk' || t === 'outdoorWalking') return 'Walk';
  return 'Other';
}

/** 单个活动的运动类型 config */
export function getSportConfig(rawType: string | null | undefined): SportTypeConfig {
  const key = normalizeSportType(rawType);
  return SPORT_BY_KEY[key] || SPORT_BY_KEY.Other;
}
