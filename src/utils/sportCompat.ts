// 运动类型兼容层 - 中等改造第三阶段
// 同一个动作在 5+ 数据源（Strava / Apple HealthKit / Keep / Garmin / GPX / Nike / 中文名）下
// 不同命名方式都映射到同一个桶。
//
// 数据源说明：
// - Strava 标准 activity type: Run, Ride, Hike, Walk, Swim, VirtualRun, VirtualRide, ...
// - Apple HealthKit workout activityType: Running, Walking, Cycling, Hiking, ...
// - Keep dataType: outdoorRunning, outdoorWalking, outdoorCycling, indoorRunning, mountaineering
// - Garmin FIT: running, cycling, hiking, ...
// - GPX 文件无 type 字段（用 name 关键词）
// - 中文/口语化 name: "Route 2026-04-03 7:30am", "跑步机", "越野跑", "室内跑", "徒步", "骑行", "力量训练", ...
//
// 设计原则（用户 2026-06-08 明确要求）：
// 1. 跑步/室内跑/户外跑/越野跑/跑步机 = 都归"跑步"一类
// 2. 同一动作在不同 App 不同语言都要映射到同一个桶（兼容性）
// 3. 全部失败时兜底"其他"，不丢数据

export interface SportCompat {
  /** 桶 key（英文标准名，前端用） */
  key: string;
  /** 中文显示名 */
  label: string;
  /** emoji */
  emoji: string;
  /** 主题色（hex） */
  color: string;
  /** 浅色背景（hex with alpha 或 rgba） */
  colorBg: string;
  /** 单位偏好 */
  unit: 'km' | 'mi' | 'm';
  /** type 字段精确匹配（不分大小写） */
  typeMatches: string[];
  /** name 字段正则关键词（任意一个匹配即归此桶） */
  nameKeywords: RegExp[];
  /** 描述 */
  desc: string;
}

/**
 * 20+ 桶定义 - 覆盖项目支持的全部运动类型
 * 顺序：高频运动在前（跑步/徒步/步行/骑行/游泳），力量/搏击/球类/水上/极限在后
 *
 * 命名规则：
 * - 桶 key 全部英文（前端/路由用）
 * - 中文 label 走 i18n 文案
 * - 颜色取自 const.ts 暗色主题色板
 */
export const SPORT_COMPAT: SportCompat[] = [
  // === 高频运动 ===
  {
    key: 'Run',
    label: '跑步',
    emoji: '🏃',
    color: '#5eb0ff',
    colorBg: 'rgba(94, 176, 255, 0.12)',
    unit: 'km',
    // 跑步合一：户外跑/室内跑/跑步机/越野跑/轮椅跑 都归"跑步"（用户 2026-06-08 明确要求）
    typeMatches: [
      'Run', 'run', 'Running', 'running',
      'VirtualRun', 'virtualrun',
      'TrailRun', 'trailrun', 'Trail',
      'Treadmill', 'treadmill',
      'IndoorRun', 'indoorrun', 'IndoorRunning', 'indoorrunning',
      'OutdoorRun', 'outdoorrun', 'OutdoorRunning', 'outdoorrunning',
      'WheelchairRunPace', 'wheelchairrunpace',
    ],
    nameKeywords: [
      /run from gpx/i,
      /run from keep/i,
      /run from apple watch/i,
      /outdoor\s*run/i,
      /treadmill/i,
      /indoor\s*run/i,
      /trail\s*run/i,
      /跑步机/,
      /越野跑/,
      /室外跑/,
      /室内跑/,
      /户外跑/,
      /晨跑|夜跑/,
      /^route\s+\d{4}/i, // Keep 通用名 "Route 2026-04-03 ..."（type=Run 但实际可能是其他）
    ],
    desc: '从街道到山野的每一步',
  },
  {
    key: 'Hiking',
    label: '徒步',
    emoji: '🥾',
    color: '#7dd3a8',
    colorBg: 'rgba(125, 211, 168, 0.12)',
    unit: 'km',
    typeMatches: [
      'Hike', 'hike', 'Hiking', 'hiking',
      'Mountaineering', 'mountaineering',
      'Climbing', 'climbing',
      'Trekking', 'trekking',
    ],
    nameKeywords: [
      /hike\s*from\s*gpx/i,
      /mountaineering/i,
      /trekking/i,
      /徒步/,
      /登山/,
      /爬山/,
      /穿越/,
      /hike\b/i,
    ],
    desc: '翻过的每一座山、踩过的每一条路',
  },
  {
    key: 'Walk',
    label: '步行',
    emoji: '🚶',
    color: '#98989d',
    colorBg: 'rgba(152, 152, 157, 0.12)',
    unit: 'km',
    typeMatches: [
      'Walk', 'walk', 'Walking', 'walking',
      'OutdoorWalk', 'outdoorwalk', 'OutdoorWalking', 'outdoorwalking',
      'WheelchairWalkPace', 'wheelchairwalkpace',
    ],
    nameKeywords: [
      /walk\s*from\s*gpx/i,
      /outdoor\s*walk/i,
      /步行/,
      /散步/,
      /徒步走/,
    ],
    desc: '日常的每一步',
  },
  {
    key: 'Ride',
    label: '骑行',
    emoji: '🚴',
    color: '#c084fc',
    colorBg: 'rgba(192, 132, 252, 0.12)',
    unit: 'km',
    typeMatches: [
      'Ride', 'ride',
      'Cycling', 'cycling',
      'OutdoorCycling', 'outdoorcycling',
      'IndoorCycling', 'indoorcycling',
      'VirtualRide', 'virtualride',
      'EBikeRide', 'ebikeride',
      'EMountainBikeRide', 'emountainbikeride',
      'Handcycle', 'handcycle',
      'GravelRide', 'gravelride',
      'MountainBikeRide', 'mountainbikeride',
      'RoadRide', 'roadride',
    ],
    nameKeywords: [
      /ride\s*from\s*gpx/i,
      /bike\b/i,
      /cycl/i,
      /骑行/,
      /骑车/,
      /自行车/,
      /动感单车/,
      /公路车/,
      /山地车/,
    ],
    desc: '两轮上的距离',
  },
  {
    key: 'Swim',
    label: '游泳',
    emoji: '🏊',
    color: '#5ac8fa',
    colorBg: 'rgba(90, 200, 250, 0.12)',
    unit: 'm', // 游泳用米
    typeMatches: [
      'Swim', 'swim', 'Swimming', 'swimming',
      'OpenWaterSwim', 'openwaterswim',
      'PoolSwim', 'poolswim',
    ],
    nameKeywords: [
      /swim/i,
      /游泳/,
    ],
    desc: '泳池里的每一米',
  },
  // === 力量 / 器械 / 健身 ===
  {
    key: 'Strength',
    label: '力量训练',
    emoji: '💪',
    color: '#f97316',
    colorBg: 'rgba(249, 115, 22, 0.12)',
    unit: 'km',
    typeMatches: [
      'Workout', 'workout',
      'WeightTraining', 'weighttraining',
      'FunctionalStrengthTraining', 'functionalstrengthtraining',
      'TraditionalStrengthTraining', 'traditionalstrengthtraining',
      'CrossTraining', 'crosstraining',
      'Crossfit', 'crossfit',
    ],
    nameKeywords: [
      /strength/i,
      /weight\b/i,
      /crossfit/i,
      /力量/,
      /器械/,
      /撸铁/,
      /举重/,
    ],
    desc: '肌肉的每一下收缩',
  },
  {
    key: 'Core',
    label: '核心训练',
    emoji: '🧘‍♀️',
    color: '#a78bfa',
    colorBg: 'rgba(167, 139, 250, 0.12)',
    unit: 'km',
    typeMatches: [
      'CoreTraining', 'coretraining',
      'Pilates', 'pilates',
      'HIIT', 'hiit',
      'MindBody', 'mindbody',
    ],
    nameKeywords: [
      /core/i,
      /pilates/i,
      /hiit/i,
      /核心/,
      /普拉提/,
      /腹肌/,
    ],
    desc: '腰腹的稳定',
  },
  {
    key: 'Yoga',
    label: '瑜伽',
    emoji: '🧘',
    color: '#fb923c',
    colorBg: 'rgba(251, 146, 60, 0.12)',
    unit: 'km',
    typeMatches: [
      'Yoga', 'yoga',
      'TaiChi', 'taichi',
    ],
    nameKeywords: [
      /yoga/i,
      /瑜伽/,
      /冥想/,
      /太极/,
    ],
    desc: '身心合一的呼吸',
  },
  // === 有氧器械 ===
  {
    key: 'Elliptical',
    label: '椭圆机',
    emoji: '⭕',
    color: '#60a5fa',
    colorBg: 'rgba(96, 165, 250, 0.12)',
    unit: 'km',
    typeMatches: [
      'Elliptical', 'elliptical',
    ],
    nameKeywords: [
      /elliptical/i,
      /椭圆机/,
    ],
    desc: '低冲击的有氧',
  },
  {
    key: 'StairStepper',
    label: '爬楼',
    emoji: '🪜',
    color: '#30d158',
    colorBg: 'rgba(48, 209, 88, 0.12)',
    unit: 'km',
    typeMatches: [
      'StairStepper', 'stairstepper',
      'StairClimbing', 'stairclimbing',
      'Stairs', 'stairs',
      'StepTraining', 'steptraining',
    ],
    nameKeywords: [
      /stair/i,
      /step\b/i,
      /爬楼/,
      /楼梯/,
    ],
    desc: '一步步向上',
  },
  {
    key: 'Rowing',
    label: '划船机',
    emoji: '🚣',
    color: '#06b6d4',
    colorBg: 'rgba(6, 182, 212, 0.12)',
    unit: 'km',
    typeMatches: [
      'Rowing', 'rowing',
    ],
    nameKeywords: [
      /row(?!ing_from| from)/i,  // 排除 "rowing from" 这种非主词
      /划船/,
    ],
    desc: '拉桨的力量',
  },
  // === 搏击 ===
  {
    key: 'Boxing',
    label: '拳击',
    emoji: '🥊',
    color: '#dc2626',
    colorBg: 'rgba(220, 38, 38, 0.12)',
    unit: 'km',
    typeMatches: [
      'Boxing', 'boxing',
      'Kickboxing', 'kickboxing',
      'MartialArts', 'martialarts',
      'Wrestling', 'wrestling',
      'MMA', 'mma',
      'Fencing', 'fencing',
    ],
    nameKeywords: [
      /box(?!ing_)/i,
      /kickbox/i,
      /martial/i,
      /wrestl/i,
      /boxing/i,
      /kickboxing/i,
      /拳击/,
      /搏击/,
      /格斗/,
      /武术/,
      /摔跤/,
      /击剑/,
    ],
    desc: '出拳的瞬间',
  },
  {
    key: 'RopeSkipping',
    label: '跳绳',
    emoji: '🪢',
    color: '#f59e0b',
    colorBg: 'rgba(245, 158, 11, 0.12)',
    unit: 'min',
    typeMatches: [
      'RopeSkipping', 'ropeskipping',
      'JumpRope', 'jumprope',
      'SkippingRope', 'skippingrope',
    ],
    nameKeywords: [
      /跳绳/,
      /rope.?skipp?/i,
      /jump.?rope/i,
      /skipping/i,
    ],
    desc: '节奏感的燃脂',
  },
  // === 球类 ===
  {
    key: 'Soccer',
    label: '足球',
    emoji: '⚽',
    color: '#10b981',
    colorBg: 'rgba(16, 185, 129, 0.12)',
    unit: 'km',
    typeMatches: [
      'Soccer', 'soccer',
      'Football', 'football',
      'Rugby', 'rugby',
      'AustralianFootball', 'australianfootball',
    ],
    nameKeywords: [
      /soccer/i,
      /football/i,
      /rugby/i,
      /足球/,
      /橄榄球/,
    ],
    desc: '11 个人的默契',
  },
  {
    key: 'Basketball',
    label: '篮球',
    emoji: '🏀',
    color: '#f59e0b',
    colorBg: 'rgba(245, 158, 11, 0.12)',
    unit: 'km',
    typeMatches: [
      'Basketball', 'basketball',
      'Volleyball', 'volleyball',
    ],
    nameKeywords: [
      /basketball/i,
      /volleyball/i,
      /篮球/,
      /排球/,
    ],
    desc: '空心入网的清脆',
  },
  {
    key: 'Tennis',
    label: '网球',
    emoji: '🎾',
    color: '#84cc16',
    colorBg: 'rgba(132, 204, 22, 0.12)',
    unit: 'km',
    typeMatches: [
      'Tennis', 'tennis',
      'Badminton', 'badminton',
      'Squash', 'squash',
      'TableTennis', 'tabletennis',
      'Racquetball', 'racquetball',
      'Padel', 'padel',
      'Pickleball', 'pickleball',
    ],
    nameKeywords: [
      /tennis/i,
      /badminton/i,
      /squash/i,
      /padel/i,
      /pickleball/i,
      /网球/,
      /羽毛球/,
      /壁球/,
      /乒乓球/,
      /匹克球/,
    ],
    desc: '挥拍的节奏',
  },
  // === 极限 / 水上 / 雪上 ===
  {
    key: 'Skiing',
    label: '滑雪',
    emoji: '⛷️',
    color: '#0ea5e9',
    colorBg: 'rgba(14, 165, 233, 0.12)',
    unit: 'km',
    typeMatches: [
      'Skiing', 'skiing',
      'Snowboarding', 'snowboarding',
      'AlpineSkiing', 'alpineskiing',
      'BackcountrySkiing', 'backcountryskiing',
      'CrossCountrySkiing', 'crosscountryskiing',
      'DownhillSkiing', 'downhillskiing',
      'NordicSkiing', 'nordicskiing',
      'RollerSkiing', 'rollerskiing',
    ],
    nameKeywords: [
      /ski/i,
      /snowboard/i,
      /滑雪/,
      /单板/,
      /双板/,
    ],
    desc: '雪上的速度',
  },
  {
    key: 'Surfing',
    label: '冲浪',
    emoji: '🏄',
    color: '#0891b2',
    colorBg: 'rgba(8, 145, 178, 0.12)',
    unit: 'km',
    typeMatches: [
      'Surfing', 'surfing',
      'Kitesurf', 'kitesurf',
      'Windsurf', 'windsurf',
      'Sailing', 'sailing',
      'Kayaking', 'kayaking',
      'Canoeing', 'canoeing',
    ],
    nameKeywords: [
      /surf/i,
      /kite/i,
      /wind/i,
      /sail/i,
      /kayak/i,
      /canoe/i,
      /冲浪/,
      /帆板/,
      /皮划艇/,
      /赛艇/,
    ],
    desc: '浪尖的舞步',
  },
  {
    key: 'Golf',
    label: '高尔夫',
    emoji: '⛳',
    color: '#16a34a',
    colorBg: 'rgba(22, 163, 74, 0.12)',
    unit: 'km',
    typeMatches: [
      'Golf', 'golf',
    ],
    nameKeywords: [
      /golf/i,
      /高尔夫/,
    ],
    desc: '一杆进洞的优雅',
  },
  // === 其它 ===
  {
    key: 'Wheelchair',
    label: '轮椅',
    emoji: '♿',
    color: '#a3a3a3',
    colorBg: 'rgba(163, 163, 163, 0.12)',
    unit: 'km',
    typeMatches: [
      'Wheelchair', 'wheelchair',
    ],
    nameKeywords: [
      /wheelchair/i,
      /轮椅/,
    ],
    desc: '无障碍的运动',
  },
  {
    key: 'Other',
    label: '其他',
    emoji: '⚡',
    color: '#94a3b8',
    colorBg: 'rgba(148, 163, 184, 0.08)',
    unit: 'km',
    typeMatches: [],
    nameKeywords: [],
    desc: '其他运动记录',
  },
];

/** URL key → SportCompat 快查 */
export const SPORT_COMPAT_BY_KEY: Record<string, SportCompat> = SPORT_COMPAT.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<string, SportCompat>
);

/**
 * 归一化活动 type/name → 桶 key
 * 匹配顺序（先匹配先返回）：
 * 1. type 字段精确匹配（不区分大小写）
 * 2. name 字段关键词正则（任意一个匹配）
 * 3. 兜底返回 'Other'
 */
export function normalizeSportTypeCompat(
  type: string | null | undefined,
  name?: string | null
): string {
  // 1. type 字段精确匹配
  if (type) {
    const t = type.trim();
    for (const sport of SPORT_COMPAT) {
      if (sport.typeMatches.some((m) => m.toLowerCase() === t.toLowerCase())) {
        return sport.key;
      }
    }
  }

  // 2. name 关键词正则
  if (name) {
    for (const sport of SPORT_COMPAT) {
      if (sport.nameKeywords.length > 0 && sport.nameKeywords.some((re) => re.test(name))) {
        return sport.key;
      }
    }
  }

  // 3. 兜底
  return 'Other';
}

/** 单个活动的运动类型 config */
export function getSportCompatConfig(
  type: string | null | undefined,
  name?: string | null
): SportCompat {
  const key = normalizeSportTypeCompat(type, name);
  return SPORT_COMPAT_BY_KEY[key] || SPORT_COMPAT_BY_KEY.Other;
}
