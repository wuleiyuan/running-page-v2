/**
 * activitiesDisplay 单元测试
 * 用 vitest 跑（pnpm test）
 *
 * 覆盖：
 * 1. distance 维度（Run / Hiking / Walk / Ride / Swim）—— 距离 + 配速/时长
 * 2. count 维度（StairStepper / RopeSkipping / Tennis）—— 次数 + 时长
 * 3. duration 维度（Strength / Yoga / Workout）—— 时长 + 心率
 * 4. 异常检测（0 距离 + 长时长 / Run 速度异常）
 * 5. 聚合（总距离 / 总次数 / 总时长）
 */

import { describe, expect, it } from 'vitest';
import type { Activity } from '../activitiesDisplay';
import {
  aggregateDisplayMetric,
  getDisplayMetric,
  movingTimeToSecondsForTest,
} from '../activitiesDisplay';

// 测试 fixture
const runActivity: Activity = {
  run_id: 1,
  name: '跑步 Running',
  distance: 5210, // 5.21 km
  moving_time: '1970-01-01 00:26:30',
  elapsed_time: '1970-01-01 00:26:30',
  type: 'Run',
  start_date: '2026-06-09 00:30:55',
  start_date_local: '2026-06-09 08:30:55',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 152,
  average_speed: 3.27,
  subtype: 'Run',
  elevation_gain: 0,
  streak: 1,
};

const stairStepperActivity: Activity = {
  run_id: 2,
  name: '爬楼',
  distance: 0,
  moving_time: '1970-01-01 00:15:00',
  elapsed_time: '1970-01-01 00:15:00',
  type: 'StairStepper',
  start_date: '2026-06-08 19:00:00',
  start_date_local: '2026-06-08 19:00:00',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 130,
  average_speed: 0,
  subtype: 'StairStepper',
  elevation_gain: 0,
  streak: 1,
  floors: 20, // 20 层
} as Activity & { floors: number };

const ropeSkippingActivity: Activity = {
  run_id: 3,
  name: '跳绳',
  distance: 0,
  moving_time: '1970-01-01 00:10:00',
  elapsed_time: '1970-01-01 00:10:00',
  type: 'RopeSkipping',
  start_date: '2026-06-07 19:00:00',
  start_date_local: '2026-06-07 19:00:00',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 145,
  average_speed: 0,
  subtype: 'RopeSkipping',
  elevation_gain: 0,
  streak: 1,
  reps: 500, // 500 次
} as Activity & { reps: number };

const yogaActivity: Activity = {
  run_id: 4,
  name: '瑜伽',
  distance: 0,
  moving_time: '1970-01-01 00:45:00',
  elapsed_time: '1970-01-01 00:45:00',
  type: 'Yoga',
  start_date: '2026-06-06 19:00:00',
  start_date_local: '2026-06-06 19:00:00',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 80,
  average_speed: 0,
  subtype: 'Yoga',
  elevation_gain: 0,
  streak: 1,
};

const zeroDistanceLongTimeActivity: Activity = {
  run_id: 5,
  name: '异常 Workout',
  distance: 0,
  moving_time: '1970-01-01 02:00:00', // 2 小时
  elapsed_time: '1970-01-01 02:00:00',
  type: 'Workout',
  start_date: '2026-06-05 19:00:00',
  start_date_local: '2026-06-05 19:00:00',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 120,
  average_speed: 0,
  subtype: 'Workout',
  elevation_gain: 0,
  streak: 1,
};

const impossibleSpeedActivity: Activity = {
  run_id: 6,
  name: '异常 Run',
  distance: 1000, // 1 km
  moving_time: '1970-01-01 02:00:00', // 2 小时 = 0.5 km/h
  elapsed_time: '1970-01-01 02:00:00',
  type: 'Run',
  start_date: '2026-06-04 19:00:00',
  start_date_local: '2026-06-04 19:00:00',
  location_country: 'CN',
  summary_polyline: '',
  average_heartrate: 100,
  average_speed: 0.14,
  subtype: 'Run',
  elevation_gain: 0,
  streak: 1,
};

describe('movingTimeToSecondsForTest', () => {
  it('parses standard moving_time', () => {
    expect(movingTimeToSecondsForTest('1970-01-01 00:26:30')).toBe(1590);
    expect(movingTimeToSecondsForTest('1970-01-01 02:00:00')).toBe(7200);
  });
  it('returns 0 for empty input', () => {
    expect(movingTimeToSecondsForTest(undefined)).toBe(0);
    expect(movingTimeToSecondsForTest('')).toBe(0);
  });
});

describe('getDisplayMetric - distance dimension', () => {
  it('Run shows distance + pace', () => {
    const m = getDisplayMetric(runActivity);
    expect(m.label).toBe('距离');
    expect(m.value).toBe('5.21 km');
    expect(m.subLabel).toBe('配速');
    expect(m.subValue).toMatch(/5'\d{2}"\/km/);
    expect(m.unit).toBe('km');
    expect(m.anomaly).toBeUndefined();
  });

  it('Hiking shows distance + duration (no pace)', () => {
    const hiking: Activity = { ...runActivity, type: 'Hiking', name: '徒步 Hiking', average_speed: 1.5 };
    const m = getDisplayMetric(hiking);
    expect(m.label).toBe('距离');
    expect(m.value).toBe('5.21 km');
    expect(m.subLabel).toBe('时长');
    expect(m.subValue).toBe('26 min');
  });
});

describe('getDisplayMetric - count dimension', () => {
  it('StairStepper shows floors + duration', () => {
    const m = getDisplayMetric(stairStepperActivity);
    expect(m.label).toBe('数量');
    expect(m.value).toBe('20 层');
    expect(m.subLabel).toBe('时长');
    expect(m.subValue).toBe('15 min');
    expect(m.unit).toBe('层');
  });

  it('RopeSkipping shows reps + duration', () => {
    const m = getDisplayMetric(ropeSkippingActivity);
    expect(m.label).toBe('次数');
    expect(m.value).toBe('500 次');
    expect(m.subLabel).toBe('时长');
    expect(m.subValue).toBe('10 min');
    expect(m.unit).toBe('次');
  });

  it('count activity without reps/steps/floors shows "无数据"', () => {
    const noCountActivity: Activity = { ...ropeSkippingActivity };
    delete (noCountActivity as Record<string, unknown>).reps;
    const m = getDisplayMetric(noCountActivity);
    expect(m.value).toBe('无次数据');
  });
});

describe('getDisplayMetric - duration dimension', () => {
  it('Yoga shows duration + heart rate', () => {
    const m = getDisplayMetric(yogaActivity);
    expect(m.label).toBe('时长');
    expect(m.value).toBe('45 min');
    expect(m.subLabel).toBe('平均心率');
    expect(m.subValue).toBe('80 bpm');
    expect(m.unit).toBe('min');
  });
});

describe('getDisplayMetric - anomaly detection', () => {
  it('flags 0 distance + long time as warning', () => {
    const m = getDisplayMetric(zeroDistanceLongTimeActivity);
    expect(m.anomaly).toBe('warning');
    expect(m.anomalyReason).toContain('0 距离');
  });

  it('flags impossibly slow Run as error', () => {
    const m = getDisplayMetric(impossibleSpeedActivity);
    expect(m.anomaly).toBe('error');
    expect(m.anomalyReason).toContain('异常低');
  });

  it('does not flag normal Run', () => {
    const m = getDisplayMetric(runActivity);
    expect(m.anomaly).toBeUndefined();
  });
});

describe('aggregateDisplayMetric', () => {
  it('aggregates total distance for Run activities', () => {
    const m = aggregateDisplayMetric([runActivity, { ...runActivity, run_id: 2, distance: 3000 }]);
    expect(m?.value).toBe('8.21 km');
    expect(m?.subValue).toBe('2 次');
  });

  it('aggregates total count for RopeSkipping', () => {
    const a1 = { ...ropeSkippingActivity, run_id: 1, reps: 500 };
    const a2 = { ...ropeSkippingActivity, run_id: 2, reps: 300 };
    const m = aggregateDisplayMetric([a1, a2] as Activity[]);
    expect(m?.value).toBe('800 次');
    expect(m?.subValue).toBe('2 次');
  });

  it('returns null for empty array', () => {
    expect(aggregateDisplayMetric([])).toBeNull();
  });
});
