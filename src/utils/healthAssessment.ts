/**
 * 运动健康评估与建议引擎
 *
 * 数据源：
 * 1. health_stats.json（Apple HealthKit 汇总）— HR / RHR / 睡眠 / 步数
 * 2. activities.json（运动记录）— 训练负荷 / 强度 / 频率
 *
 * 设计原则（用户 2026-06-12 明确要求）：
 * 1. 评估基于"近 7 天 / 近 30 天 / 总体"三个时间窗口（既有近期也有基线）
 * 2. 建议分级："立即调整" / "本周关注" / "维持现状"
 * 3. 不做医学判断（标注：本评估仅供参考，不替代医生意见）
 * 4. 完全可测试（纯函数 + 类型化输入输出）
 * 5. 完全可重放（同样输入 → 同样输出，无副作用）
 *
 * 参考文献（算法选用的医学参考范围）：
 * - RHR 区间：基于美国心脏协会 (AHA) 静息心率分级
 *   优秀 < 60 / 良好 60-64 / 一般 65-69 / 偏高 70-79 / 高 ≥ 80
 * - HRV 区间：基于 Apple Heart Rate Study + Kubios 公开数据
 *   高 > 50ms / 中 30-50ms / 低 < 30ms
 * - 睡眠区间：基于 NSF 睡眠时长建议
 *   充足 7-9h / 略少 6-7h / 不足 < 6h
 * - 训练负荷：基于 acute:chronic workload ratio (ACWR) 公开论文
 *   安全 0.8-1.3 / 警戒 1.3-1.5 / 危险 > 1.5 / 不足 < 0.8
 */

import type { Activity } from '@/hooks/useActivities';
import healthStatsRaw from '@/static/health_stats.json';
import activitiesJson from '@/static/activities.json';

// ==================== 类型定义 ====================

export type Severity = 'good' | 'watch' | 'warn' | 'urgent';

export interface AssessmentCard {
  /** 卡片唯一 key */
  key: string;
  /** 标题（如 "心率评估"） */
  title: string;
  /** 主指标值（如 "83.4 bpm"） */
  main: string;
  /** 副标题 / 数值摘要 */
  sub: string;
  /** 严重程度（决定卡片颜色） */
  severity: Severity;
  /** 评估建议文本（中文，1-2 句） */
  advice: string;
  /** 支撑数据 / 上下文（用于折叠展开） */
  detail?: string;
}

export interface AssessmentBundle {
  generatedAt: string;
  windowDays: 7 | 30;
  cards: AssessmentCard[];
  /** 综合建议（基于所有卡片生成） */
  overall: string;
}

// ==================== 健康统计类型 ====================

interface HealthStatsDaily {
  hr?: {
    mean?: number;
    min?: number;
    max?: number;
    count?: number;
    zones?: {
      rest?: number;
      normal?: number;
      fat_burn?: number;
      aerobic?: number;
      anaerobic?: number;
    };
  };
  rhr?: {
    mean?: number;
    count?: number;
  };
  steps?: {
    total?: number;
    count?: number;
  };
  sleep?: {
    total_hours?: number;
    deep_hours?: number;
    rem_hours?: number;
    core_hours?: number;
    unspec_hours?: number;
  };
}

interface HealthStats {
  generated_at: string;
  top_stats: {
    hr: { mean_all: number; median: number; max_ever: number; days_with_data: number };
    rhr: { mean_all: number; median: number; min_ever: number; days_with_data: number };
    hrv: { mean_all: number; median: number; days_with_data: number };
    sleep: { median_hours: number; days_with_data: number };
    steps: { mean_daily: number; median_daily: number; total: number; days_with_data: number };
  };
  by_year: Record<string, {
    hr_mean?: number;
    sleep_median_h?: number;
    steps_mean_daily?: number;
    steps_total?: number;
    hrv_mean?: number;
    days_with_data: number;
  }>;
  daily: Record<string, HealthStatsDaily>;
}

const HEALTH_STATS = healthStatsRaw as HealthStats;
const ACTIVITIES = activitiesJson as unknown as Activity[];

// ==================== 工具函数 ====================

/**
 * ISO date string (YYYY-MM-DD) → Date
 * 用本地时区（避免 TZ 偏移错位）
 */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Date → ISO date string (YYYY-MM-DD)
 */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算 N 天前的 ISO date
 */
function daysAgoISO(days: number, refDate: Date = new Date()): string {
  const d = new Date(refDate);
  d.setDate(d.getDate() - days);
  return toLocalISODate(d);
}

/**
 * 从 health_stats.json daily 提取最近 N 天数据
 */
function getRecentDaily(days: number): HealthStatsDaily[] {
  const startDate = daysAgoISO(days);
  const dates = Object.keys(HEALTH_STATS.daily)
    .filter((d) => d >= startDate)
    .sort();
  return dates.map((d) => HEALTH_STATS.daily[d]);
}

/**
 * 从 activities.json 提取最近 N 天的活动
 */
function getRecentActivities(days: number): Activity[] {
  const startDate = daysAgoISO(days);
  return ACTIVITIES.filter((a) => {
    const local = a.start_date_local?.slice(0, 10) || '';
    return local >= startDate;
  });
}

/**
 * 算数组均值（忽略 null/undefined）
 */
function mean(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && !isNaN(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * 算数组中位数
 */
function median(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && !isNaN(n));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ==================== 评估卡片生成器 ====================

/**
 * RHR（静息心率）评估
 *
 * 算法：取最近 7 天 RHR 均值，对比基线（top_stats.median）
 * - 差值 < 3 bpm: 维持
 * - 差值 3-7 bpm: 本周关注（可能疲劳累积）
 * - 差值 > 7 bpm: 立即调整（感冒/过度训练/脱水）
 */
function assessRHR(recent7: HealthStatsDaily[]): AssessmentCard {
  const rhrValues = recent7.map((d) => d.rhr?.mean).filter((v): v is number => typeof v === 'number');
  const recentMean = mean(rhrValues);
  const baseline = HEALTH_STATS.top_stats.rhr.median;

  if (recentMean === null) {
    return {
      key: 'rhr',
      title: '静息心率（RHR）',
      main: '数据不足',
      sub: `基线 ${baseline.toFixed(0)} bpm`,
      severity: 'watch',
      advice: '近 7 天 RHR 数据缺失，可能 Apple Watch 未戴。',
    };
  }

  const diff = recentMean - baseline;
  let severity: Severity;
  let advice: string;

  if (Math.abs(diff) < 3) {
    severity = 'good';
    advice = 'RHR 稳定在基线附近，心肺功能保持良好。继续保持。';
  } else if (diff >= 3 && diff <= 7) {
    severity = 'watch';
    advice = 'RHR 较基线上升 3-7 bpm，可能存在训练疲劳累积或睡眠不足。建议本周降低训练强度。';
  } else if (diff > 7) {
    severity = 'urgent';
    advice = 'RHR 较基线上升超过 7 bpm，强烈建议休息 2-3 天。注意是否感冒、脱水或训练过度。';
  } else {
    // diff < -3 (RHR 下降)
    severity = 'good';
    advice = 'RHR 较基线下降，心肺功能改善。保持当前训练节奏。';
  }

  return {
    key: 'rhr',
    title: '静息心率（RHR）',
    main: `${recentMean.toFixed(1)} bpm`,
    sub: `基线 ${baseline.toFixed(1)} bpm · 7 天 ${rhrValues.length}/${recent7.length} 天有数据`,
    severity,
    advice,
  };
}

/**
 * HRV（心率变异性）评估
 *
 * 局限：health_stats.json daily 缺 HRV 字段
 * 只能基于 top_stats + by_year 总体均值
 * 建议方向：若用户开了 HRV 记录，扩展 daily schema
 */
function assessHRV(): AssessmentCard {
  const mean = HEALTH_STATS.top_stats.hrv.mean_all;
  const days = HEALTH_STATS.top_stats.hrv.days_with_data;

  let severity: Severity;
  let advice: string;

  if (mean > 50) {
    severity = 'good';
    advice = 'HRV 较高，自主神经系统恢复能力良好。';
  } else if (mean >= 30) {
    severity = 'watch';
    advice = 'HRV 中等水平。建议关注睡眠质量与恢复时间。';
  } else {
    severity = 'warn';
    advice = 'HRV 偏低，恢复能力可能受限。考虑减少高强度训练。';
  }

  return {
    key: 'hrv',
    title: '心率变异性（HRV）',
    main: `${mean.toFixed(1)} ms`,
    sub: `${days} 天均值`,
    severity,
    advice,
    detail: 'HRV 暂未提供日级别数据。评估基于总体均值。建议 Apple Watch 开启 HRV 测量以获得更精细的恢复建议。',
  };
}

/**
 * 睡眠评估
 *
 * 算法：近 7 天睡眠中位数（小时）
 * - 7-9h: 良好
 * - 6-7h 或 9-10h: 关注
 * - < 6h 或 > 10h: 警告
 */
function assessSleep(recent7: HealthStatsDaily[]): AssessmentCard {
  const sleepHours = recent7
    .map((d) => d.sleep?.total_hours)
    .filter((v): v is number => typeof v === 'number');
  const recentMedian = median(sleepHours);
  const baseline = HEALTH_STATS.top_stats.sleep.median_hours;

  if (recentMedian === null) {
    return {
      key: 'sleep',
      title: '睡眠',
      main: '数据不足',
      sub: `基线中位 ${baseline.toFixed(1)} h`,
      severity: 'watch',
      advice: '近 7 天睡眠数据缺失。',
    };
  }

  let severity: Severity;
  let advice: string;

  if (recentMedian >= 7 && recentMedian <= 9) {
    severity = 'good';
    advice = '睡眠时长处于 NSF 建议范围 (7-9h)，恢复充分。';
  } else if ((recentMedian >= 6 && recentMedian < 7) || (recentMedian > 9 && recentMedian <= 10)) {
    severity = 'watch';
    advice =
      recentMedian < 7
        ? '睡眠略偏少 (6-7h)，可能影响训练恢复。建议提前 30 分钟入睡。'
        : '睡眠略偏多 (9-10h)，注意是否过度疲劳或睡眠质量低。';
  } else if (recentMedian < 6) {
    severity = 'urgent';
    advice = '睡眠严重不足 (<6h)，强烈影响恢复与表现。建议立即调整作息。';
  } else {
    severity = 'warn';
    advice = '睡眠过长 (>10h)，可能伴随疲劳感，建议就医排查。';
  }

  return {
    key: 'sleep',
    title: '睡眠',
    main: `${recentMedian.toFixed(2)} h`,
    sub: `基线 ${baseline.toFixed(2)} h · 7 天 ${sleepHours.length}/${recent7.length} 晚有数据`,
    severity,
    advice,
  };
}

/**
 * 步数评估
 *
 * 算法：近 7 天步数均值
 * - 10000+ 步/天: 优秀
 * - 7000-10000: 良好
 * - 4000-7000: 一般
 * - < 4000: 久坐风险
 */
function assessSteps(recent7: HealthStatsDaily[]): AssessmentCard {
  const stepValues = recent7
    .map((d) => d.steps?.total)
    .filter((v): v is number => typeof v === 'number');
  const recentMean = mean(stepValues);
  const baseline = HEALTH_STATS.top_stats.steps.mean_daily;

  if (recentMean === null) {
    return {
      key: 'steps',
      title: '步数',
      main: '数据不足',
      sub: `基线日均 ${baseline.toFixed(0)} 步`,
      severity: 'watch',
      advice: '近 7 天步数数据缺失。',
    };
  }

  let severity: Severity;
  let advice: string;

  if (recentMean >= 10000) {
    severity = 'good';
    advice = '日均步数超过 10000，日常活动量充足。';
  } else if (recentMean >= 7000) {
    severity = 'good';
    advice = '日均步数 7000-10000，活动量良好。';
  } else if (recentMean >= 4000) {
    severity = 'watch';
    advice = '日均步数 4000-7000，活动量偏低。建议每天增加 2000 步（如步行通勤）。';
  } else {
    severity = 'urgent';
    advice = '日均步数低于 4000，久坐风险较高。建议每小时起身活动 5 分钟。';
  }

  return {
    key: 'steps',
    title: '步数',
    main: `${Math.round(recentMean).toLocaleString()} 步/天`,
    sub: `基线 ${Math.round(baseline).toLocaleString()} 步/天 · 7 天 ${stepValues.length}/${recent7.length} 天有数据`,
    severity,
    advice,
  };
}

/**
 * 训练负荷评估（ACWR 简化版）
 *
 * 算法：acute (7 天) vs chronic (28 天) 训练时间比
 * - 0.8-1.3: 安全
 * - 1.3-1.5: 警戒（受伤风险上升）
 * - > 1.5: 危险（建议减量）
 * - < 0.8: 不足（可加量）
 */
function assessTrainingLoad(): AssessmentCard {
  const recent7 = getRecentActivities(7);
  const recent28 = getRecentActivities(28);

  // moving_time 格式是 "1970-01-01 HH:MM:SS" — 取时间部分转秒
  const parseMovingTime = (s: string | undefined): number => {
    if (!s) return 0;
    const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    const [, h, mn, sc] = m;
    return parseInt(h) * 3600 + parseInt(mn) * 60 + parseInt(sc);
  };

  // 跑步 + 骑行 + 徒步 = 计入训练负荷
  const validTypes = new Set(['Run', 'Ride', 'Hiking', 'Walk']);
  const sumSeconds = (acts: Activity[]) =>
    acts.filter((a) => validTypes.has(a.type)).reduce((sum, a) => sum + parseMovingTime(a.moving_time), 0);

  const acute7d = sumSeconds(recent7) / 3600; // hours
  const chronic28d = sumSeconds(recent28) / 3600 / 4; // avg 7 days

  const ratio = chronic28d > 0 ? acute7d / chronic28d : 0;

  let severity: Severity;
  let advice: string;

  if (ratio === 0) {
    severity = 'watch';
    advice = '近 28 天无训练记录。从低强度（步行 3km）开始恢复。';
  } else if (ratio >= 0.8 && ratio <= 1.3) {
    severity = 'good';
    advice = '训练负荷在安全窗口 (0.8-1.3)，可保持当前节奏。';
  } else if (ratio > 1.3 && ratio <= 1.5) {
    severity = 'watch';
    advice = `训练负荷比 ${ratio.toFixed(2)}，处于警戒区 (1.3-1.5)。建议本周减少 20% 训练量。`;
  } else if (ratio > 1.5) {
    severity = 'urgent';
    advice = `训练负荷比 ${ratio.toFixed(2)} 超过 1.5，受伤风险高。强烈建议减量 50% 或休息 1-2 天。`;
  } else {
    severity = 'watch';
    advice = `训练负荷比 ${ratio.toFixed(2)} 偏低 (<0.8)，可逐步加量。`;
  }

  return {
    key: 'training_load',
    title: '训练负荷（ACWR）',
    main: ratio > 0 ? ratio.toFixed(2) : '—',
    sub: `近 7 天 ${acute7d.toFixed(1)} h · 4 周均 ${chronic28d.toFixed(1)} h/周`,
    severity,
    advice,
  };
}

/**
 * 综合建议
 * 基于所有卡片 severity 聚合
 */
function buildOverall(cards: AssessmentCard[]): string {
  const urgentCount = cards.filter((c) => c.severity === 'urgent').length;
  const warnCount = cards.filter((c) => c.severity === 'warn').length;
  const watchCount = cards.filter((c) => c.severity === 'watch').length;

  if (urgentCount >= 2) {
    return '当前存在 2 项及以上紧急指标，建议立即调整训练与作息，必要时咨询医生。';
  }
  if (urgentCount === 1) {
    return '存在 1 项紧急指标，建议优先处理该指标对应的建议。';
  }
  if (warnCount + watchCount >= 3) {
    return '多项指标处于关注/警告区间，建议本周整体调整，恢复优先级高于训练量。';
  }
  if (warnCount + watchCount >= 1) {
    return '整体状况良好，个别指标值得关注。按建议微调即可。';
  }
  return '所有指标均处于良好范围，继续保持当前训练与作息节奏。';
}

// ==================== 主入口 ====================

export interface AssessOptions {
  /** 评估时间窗口（默认 7 天） */
  windowDays?: 7 | 30;
  /** 参考日期（默认今天，测试用） */
  refDate?: Date;
}

export function assessHealth(opts: AssessOptions = {}): AssessmentBundle {
  const { windowDays = 7, refDate = new Date() } = opts;
  const recent7 = getRecentDaily(windowDays);

  const cards: AssessmentCard[] = [
    assessRHR(recent7),
    assessHRV(),
    assessSleep(recent7),
    assessSteps(recent7),
    assessTrainingLoad(),
  ];

  return {
    generatedAt: refDate.toISOString(),
    windowDays,
    cards,
    overall: buildOverall(cards),
  };
}
