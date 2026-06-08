// 运动总览页 - 中等改造第二阶段
// 显示所有运动类型的大卡片，统计每种运动的总量
// 入口：/sports

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import SportCard from '@/components/SportCard';
import { SPORT_TYPES, normalizeSportType } from '@/utils/sportTypes';
import activities from '@/static/activities.json';
import { Activity } from '@/utils/utils';

const SportsOverview = () => {
  // 按运动类型分组统计
  const sportStats = useMemo(() => {
    const stats: Record<
      string,
      { count: number; totalDistance: number; totalTime: number; lastDate?: string }
    > = {};

    // 先初始化所有运动类型
    SPORT_TYPES.forEach((s) => {
      stats[s.key] = { count: 0, totalDistance: 0, totalTime: 0 };
    });

    // 累加每条活动
    // 兼容层：type + name 双字段归一化（兼容 Strava/Keep/Apple HealthKit/GPX/中文）
    activities.forEach((act: Activity) => {
      const key = normalizeSportType(act.type, act.name);
      if (!stats[key]) {
        stats[key] = { count: 0, totalDistance: 0, totalTime: 0 };
      }
      stats[key].count += 1;
      stats[key].totalDistance += act.distance || 0;
      // elapsed_time 优先，moving_time 兜底（秒）
      const t = (act as any).elapsed_time || (act as any).moving_time || 0;
      stats[key].totalTime += t;
      // 最近一次活动日期
      const date = act.start_date_local || act.start_date;
      if (!stats[key].lastDate || (date && date > stats[key].lastDate)) {
        stats[key].lastDate = date;
      }
    });

    return stats;
  }, []);

  // 总体统计
  const totalStats = useMemo(() => {
    const totalCount = Object.values(sportStats).reduce((s, v) => s + v.count, 0);
    const totalDist = Object.values(sportStats).reduce((s, v) => s + v.totalDistance, 0);
    const activeSports = SPORT_TYPES.filter((s) => sportStats[s.key]?.count > 0).length;
    return { totalCount, totalDist, activeSports };
  }, [sportStats]);

  return (
    <Layout>
      <Helmet>
        <title>运动总览</title>
      </Helmet>

      <div className="mx-auto max-w-screen-2xl px-6 lg:px-16 py-8">
        {/* 页头 */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
            <Link to="/" className="hover:text-white transition-colors">
              ← 回到主页
            </Link>
          </div>
          <h1 className="text-3xl font-semibold text-white mb-2">运动总览</h1>
          <p className="text-gray-400 text-sm">
            {SPORT_TYPES.length} 种运动类型 · {activeSportsIn(sportStats)} 项有数据 · 共{' '}
            {totalStats.totalCount.toLocaleString()} 次活动
          </p>
        </header>

        {/* 运动卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SPORT_TYPES.map((sport) => {
            const stat = sportStats[sport.key] || {
              count: 0,
              totalDistance: 0,
              totalTime: 0,
            };
            return (
              <SportCard
                key={sport.key}
                sport={sport}
                count={stat.count}
                totalDistance={stat.totalDistance}
                totalTime={stat.totalTime}
                lastDate={stat.lastDate}
                href={`/sports/${sport.key}`}
              />
            );
          })}
        </div>

        {/* 底部说明 */}
        <footer className="mt-12 text-center text-xs text-gray-500">
          <p>数据源：Strava + Keep + Apple HealthKit · 最近更新 {new Date().toLocaleDateString('zh-CN')}</p>
        </footer>
      </div>
    </Layout>
  );
};

// 辅助：有数据的运动类型数
function activeSportsIn(stats: Record<string, { count: number }>): number {
  return Object.values(stats).filter((s) => s.count > 0).length;
}

export default SportsOverview;
