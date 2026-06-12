/**
 * 活动显示指标工具
 *
 * 根据 sportCompat 桶的 displayMetric 字段，决定如何展示一个活动。
 * 解决"不是所有运动都该显示距离"的用户诉求（2026-06-12）。
 *
 * 数据来源：
 * - activity.distance (m)
 * - activity.moving_time ('1970-01-01 HH:MM:SS' 或 timedelta)
 * - activity.reps / activity.steps / activity.floors (count 类)
 * - activity.calories / activity.kcal (energy 类，暂未生成)
 *
 * 兼容性：activity 没有 reps/steps/floors/calories 字段时，count 类显示 0 + "无计数数据"
 */

import activitiesJson from '@/static/activities.json';
import { getSportCompatConfig, type SportCompat } from './sportCompat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _AnyRecord = any;

/** 活动记录类型（从 activities.json 推断） */
export type Activity = (typeof activitiesJson)[number] & _AnyRecord;

export interface DisplayMetric {
  /** 主要指标标签（如 "距离" / "次数" / "时长"） */
  label: string;
  /** 主要指标格式化值（如 "5.20 km" / "120 次" / "30 min"） */
  value: string;
  /** 副指标标签（如 "配速" / "心率"） */
  subLabel?: string;
  /** 副指标格式化值（如 "5'30\"/km" / "142 bpm"） */
  subValue?: string;
  /** 单位 (km / mi / m / 次 / min / kcal) */
  unit: string;
  /** 严重程度（用于显示颜色） */
  anomaly?: 'normal' | 'warning' | 'error';
  /** 异常说明 */
  anomalyReason?: string;
}

// 运动 time format 解析 ('1970-01-01 HH:MM:SS' → seconds)
export function movingTimeToSecondsForTest(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const [, h, mn, sc] = m;
  return parseInt(h) * 3600 + parseInt(mn) * 60 + parseInt(sc);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatDistance(meters: number, unit: 'km' | 'mi' | 'm'): string {
  if (meters <= 0) return `0 ${unit}`;
  if (unit === 'km') return `${(meters / 1000).toFixed(2)} km`;
  if (unit === 'mi') return `${(meters / 1609.344).toFixed(2)} mi`;
  return `${Math.round(meters)} m`;
}

function formatPace(distance: number, seconds: number, unit: 'km' | 'mi'): string | null {
  if (distance <= 0 || seconds <= 0) return null;
  const unitDist = unit === 'km' ? 1000 : 1609.344;
  const paceSeconds = seconds / (distance / unitDist);
  const mm = Math.floor(paceSeconds / 60);
  const ss = Math.round(paceSeconds % 60);
  return `${mm}'${ss.toString().padStart(2, '0')}"/${unit}`;
}

/**
 * 检测异常数据（防御性：即使 generator.filter 漏过滤，UI 层也提示用户）
 */
function detectAnomaly(activity: Activity): { anomaly: 'warning' | 'error'; reason: string } | null {
  const distance = activity.distance ?? 0;
  const seconds = movingTimeToSecondsForTest(activity.moving_time);

  // 0 距离 + 长时长（任意 type）
  if (distance <= 0 && seconds > 3600) {
    return { anomaly: 'warning', reason: '0 距离 + 长时长，可能数据不全' };
  }
  // Run 速度异常
  if (activity.type === 'Run' && distance > 0 && seconds > 60) {
    const kmh = (distance / 1000) / (seconds / 3600);
    if (kmh < 1.0 && seconds > 3600) {
      return { anomaly: 'error', reason: `跑步速度 ${kmh.toFixed(2)} km/h 异常低` };
    }
    if (kmh > 30.0 && seconds > 300) {
      return { anomaly: 'error', reason: `跑步速度 ${kmh.toFixed(1)} km/h 异常高` };
    }
  }
  return null;
}

/**
 * 从 activity 取计数值（兼容多种字段名）
 */
function getCountFromActivity(activity: Activity): number {
  // 优先 reps / steps / floors / count，按字段名依次取
  const a = activity as unknown as Record<string, unknown>;
  return (
    (typeof a.reps === 'number' ? a.reps : 0) ||
    (typeof a.steps === 'number' ? a.steps : 0) ||
    (typeof a.floors === 'number' ? a.floors : 0) ||
    (typeof a.count === 'number' ? a.count : 0) ||
    0
  );
}

/**
 * 根据活动 type 返回显示指标
 */
export function getDisplayMetric(activity: Activity): DisplayMetric {
  const config: SportCompat = getSportCompatConfig(activity.type, activity.name);
  const seconds = movingTimeToSecondsForTest(activity.moving_time);
  const anomalyInfo = detectAnomaly(activity);

  // anomaly
  const anomaly = anomalyInfo?.anomaly;
  const anomalyReason = anomalyInfo?.reason;

  // === distance 维度 ===
  if (config.displayMetric === 'distance') {
    const distance = activity.distance ?? 0;
    const distStr = formatDistance(distance, config.unit);
    const paceStr = activity.type === 'Run' || activity.type === 'Walk' || activity.type === 'Hiking'
      ? formatPace(distance, seconds, config.unit === 'mi' ? 'mi' : 'km')
      : null;
    return {
      label: '距离',
      value: distStr,
      subLabel: paceStr ? '配速' : '时长',
      subValue: paceStr || formatDuration(seconds),
      unit: config.unitLabel,
      anomaly,
      anomalyReason,
    };
  }

  // === count 维度 ===
  if (config.displayMetric === 'count') {
    const count = getCountFromActivity(activity);
    const countStr = count > 0 ? `${count} ${config.unitLabel}` : `无${config.unitLabel}数据`;
    // 副指标：时长（始终有意义）
    const duration = formatDuration(seconds);
    return {
      label: config.unitLabel === '次' ? '次数' : '数量',
      value: countStr,
      subLabel: '时长',
      subValue: duration,
      unit: config.unitLabel,
      anomaly,
      anomalyReason,
    };
  }

  // === duration 维度 ===
  if (config.displayMetric === 'duration') {
    return {
      label: '时长',
      value: formatDuration(seconds),
      subLabel: '平均心率',
      subValue: activity.average_heartrate ? `${activity.average_heartrate.toFixed(0)} bpm` : '—',
      unit: 'min',
      anomaly,
      anomalyReason,
    };
  }

  // === energy 维度（暂未实现） ===
  return {
    label: '时长',
    value: formatDuration(seconds),
    subLabel: '消耗',
    subValue: '—',
    unit: 'min',
    anomaly,
    anomalyReason,
  };
}

/**
 * 批量：按 sportKey 聚合显示指标
 * 用于 sidebar / 主页跑步卡片
 */
export function aggregateDisplayMetric(activities: Activity[]): DisplayMetric | null {
  if (activities.length === 0) return null;
  // 用第一项的 config 代表（同一 sportKey 内 config 相同）
  const first = activities[0];
  const config = getSportCompatConfig(first.type, first.name);
  const totalSeconds = activities.reduce((sum, a) => sum + movingTimeToSecondsForTest(a.moving_time), 0);

  if (config.displayMetric === 'distance') {
    const totalDist = activities.reduce((sum, a) => sum + (a.distance ?? 0), 0);
    return {
      label: '总距离',
      value: formatDistance(totalDist, config.unit),
      subLabel: '活动数',
      subValue: `${activities.length} 次`,
      unit: config.unitLabel,
    };
  }

  if (config.displayMetric === 'count') {
    const totalCount = activities.reduce((sum, a) => sum + getCountFromActivity(a), 0);
    return {
      label: `总${config.unitLabel}`,
      value: `${totalCount} ${config.unitLabel}`,
      subLabel: '活动数',
      subValue: `${activities.length} 次`,
      unit: config.unitLabel,
    };
  }

  // duration / energy
  return {
    label: '总时长',
    value: formatDuration(totalSeconds),
    subLabel: '活动数',
    subValue: `${activities.length} 次`,
    unit: 'min',
  };
}
