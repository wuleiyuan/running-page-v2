/**
 * v2.2.5 — Activities 数据状态端点
 *
 * 用途：用户自查 src/static/activities.json 健康度
 *  解决 6/13 用户反馈"数据又丢了" - 不知道什么时候被 sync 覆盖
 *
 * 输出:
 *   - total: 活动总数
 *   - earliest / latest: 最早/最新活动日期
 *   - spanYears: 数据跨多少年
 *   - byYear: {2020: 73, 2021: 98, ...}
 *   - bySport: {Run: 452, ...}
 *   - hasGaps: 是否有年份空缺
 *   - warning: 当数据异常时 (e.g. 数量 < 100, 或跨度 < 2 年)
 *
 * 安全:
 *   - 静态读取 src/static/activities.json, 不暴露 key
 *   - 不写日志
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Activity {
  start_date_local?: string;
  type?: string;
  distance?: number;
}

interface ActivitiesStats {
  ok: boolean;
  total: number;
  earliest: string | null;
  latest: string | null;
  spanYears: number;
  byYear: Record<string, number>;
  bySport: Record<string, number>;
  hasGaps: boolean;
  gapYears: number[];
  warning: string | null;
  hint: string | null;
  generatedAt: string;
}

// 尝试多个可能的路径
const POSSIBLE_PATHS = [
  path.join(process.cwd(), 'src/static/activities.json'),
  path.join(process.cwd(), '../src/static/activities.json'),
  path.join(process.cwd(), '../../src/static/activities.json'),
];

async function findActivitiesFile(): Promise<string | null> {
  for (const p of POSSIBLE_PATHS) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // not found, try next
    }
  }
  return null;
}

function analyze(activities: Activity[]): ActivitiesStats {
  const byYear: Record<string, number> = {};
  const bySport: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const a of activities) {
    const date = a.start_date_local || '';
    if (date) {
      const y = date.slice(0, 4);
      byYear[y] = (byYear[y] || 0) + 1;
      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;
    }
    const sport = a.type || 'Unknown';
    bySport[sport] = (bySport[sport] || 0) + 1;
  }

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const spanYears = years.length > 0 ? years[years.length - 1] - years[0] + 1 : 0;

  // 检测年份空缺
  const gapYears: number[] = [];
  if (years.length > 0) {
    for (let y = years[0]; y <= years[years.length - 1]; y++) {
      if (!byYear[String(y)]) {
        gapYears.push(y);
      }
    }
  }
  const hasGaps = gapYears.length > 0;

  // 警告规则
  let warning: string | null = null;
  let hint: string | null = null;
  if (activities.length < 100) {
    warning = `活动数仅 ${activities.length}, 正常应在 500+`;
    hint = '检查 sync 脚本是否覆盖了历史。可用 python3 scripts/regen_activities_json.py 从 data.db 重新生成。';
  } else if (spanYears < 2 && activities.length > 0) {
    warning = `数据只跨 ${spanYears} 年, 可能有早期数据丢失`;
    hint = '同上, regen 脚本可恢复。';
  } else if (hasGaps && gapYears.length >= 2) {
    warning = `检测到 ${gapYears.length} 个年份空缺: ${gapYears.join(', ')}`;
    hint = '可能是同步脚本只覆盖了部分年份。可手动补全。';
  }

  return {
    ok: !warning,
    total: activities.length,
    earliest,
    latest,
    spanYears,
    byYear,
    bySport,
    hasGaps,
    gapYears,
    warning,
    hint,
    generatedAt: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 不缓存 (status 经常变)
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const filePath = await findActivitiesFile();
  if (!filePath) {
    return res.status(500).json({
      ok: false,
      error: 'activities.json not found in expected paths',
      tried: POSSIBLE_PATHS,
    });
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const activities = JSON.parse(content);
    if (!Array.isArray(activities)) {
      return res.status(500).json({
        ok: false,
        error: 'activities.json is not an array',
      });
    }
    const stats = analyze(activities);
    return res.status(200).json({
      ...stats,
      _meta: { filePath: filePath.replace(process.cwd(), '...') },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
}
