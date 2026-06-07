// 单运动类型详情页
// 显示某运动类型的所有活动列表
// 入口：/sports/:key

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { SPORT_BY_KEY, SPORT_TYPES, normalizeSportType } from '@/utils/sportTypes';
import activities from '@/static/activities.json';
import { Activity } from '@/utils/utils';

const SportDetail = () => {
  const { key } = useParams<{ key: string }>();
  const sport = key ? SPORT_BY_KEY[key] : null;

  // 该运动类型的所有活动
  const sportActivities = useMemo(() => {
    if (!sport) return [];
    return activities
      .filter((act: Activity) => normalizeSportType(act.type) === sport.key)
      .sort((a: Activity, b: Activity) => {
        const da = a.start_date_local || a.start_date || '';
        const db = b.start_date_local || b.start_date || '';
        return db.localeCompare(da);
      });
  }, [sport]);

  // 统计数据
  const stats = useMemo(() => {
    if (sportActivities.length === 0) {
      return { count: 0, totalDist: 0, totalTime: 0, avgDist: 0, avgPace: '' };
    }
    const totalDist = sportActivities.reduce(
      (s: number, a: Activity) => s + (a.distance || 0),
      0
    );
    const totalTime = sportActivities.reduce(
      (s: number, a: Activity) =>
        s + ((a as any).elapsed_time || (a as any).moving_time || 0),
      0
    );
    const avgDist = totalDist / sportActivities.length;
    const avgDistKm = avgDist / 1000;
    const avgTimeMin = totalTime / sportActivities.length / 60;
    const avgPace = avgDistKm > 0 ? `${(avgTimeMin / avgDistKm).toFixed(2)} /km` : '—';
    return {
      count: sportActivities.length,
      totalDist,
      totalTime,
      avgDist: avgDistKm,
      avgPace,
    };
  }, [sportActivities]);

  if (!sport) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl text-white mb-4">未找到运动类型</h1>
          <Link to="/sports" className="text-blue-400 hover:text-blue-300">
            ← 回到运动总览
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>{sport.label} · 运动详情</title>
      </Helmet>

      <div className="mx-auto max-w-screen-2xl px-6 lg:px-16 py-8">
        {/* 面包屑 */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/sports" className="hover:text-white transition-colors">
            ← 运动总览
          </Link>
          <span>·</span>
          <span>{sport.label}</span>
        </div>

        {/* 头部：emoji + 标题 + 描述 */}
        <header className="mb-8 flex items-start gap-4">
          <div
            className="text-5xl rounded-2xl p-4 flex items-center justify-center"
            style={{ backgroundColor: sport.colorBg, border: `1px solid ${sport.color}33` }}
          >
            {sport.emoji}
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white mb-1">{sport.label}</h1>
            <p className="text-gray-400 text-sm">{sport.desc}</p>
          </div>
        </header>

        {/* 统计卡片行 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatBox label="总次数" value={`${stats.count} 次`} color={sport.color} />
          <StatBox
            label="总距离"
            value={`${(stats.totalDist / 1000).toFixed(1)} km`}
            color={sport.color}
          />
          <StatBox
            label="平均距离"
            value={`${stats.avgDist.toFixed(1)} km`}
            color={sport.color}
          />
          <StatBox label="平均配速" value={stats.avgPace || '—'} color={sport.color} />
        </div>

        {/* 活动列表 */}
        <h2 className="text-xl font-medium text-white mb-4">活动记录</h2>
        {sportActivities.length === 0 ? (
          <div className="text-center text-gray-500 py-12">还没有 {sport.label} 活动</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-3 px-2">日期</th>
                  <th className="py-3 px-2">距离</th>
                  <th className="py-3 px-2">时长</th>
                  <th className="py-3 px-2">配速</th>
                </tr>
              </thead>
              <tbody>
                {sportActivities.slice(0, 50).map((act: Activity) => {
                  const distKm = ((act.distance || 0) / 1000).toFixed(2);
                  const timeSec = (act as any).elapsed_time || (act as any).moving_time || 0;
                  const timeMin = Math.round(timeSec / 60);
                  const pace = act.distance > 0
                    ? `${(timeSec / 60 / (act.distance / 1000)).toFixed(2)} /km`
                    : '—';
                  const dateStr = (act.start_date_local || act.start_date || '').slice(0, 10);
                  return (
                    <tr
                      key={act.run_id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-2.5 px-2 text-gray-300">{dateStr}</td>
                      <td className="py-2.5 px-2 tabular-nums" style={{ color: sport.color }}>
                        {distKm} km
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-gray-300">
                        {timeMin < 60 ? `${timeMin}m` : `${Math.floor(timeMin / 60)}h ${timeMin % 60}m`}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-gray-400">{pace}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sportActivities.length > 50 && (
              <p className="text-center text-xs text-gray-500 mt-3">
                显示前 50 条 / 共 {sportActivities.length} 条
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

interface StatBoxProps {
  label: string;
  value: string;
  color: string;
}

const StatBox = ({ label, value, color }: StatBoxProps) => (
  <div
    className="rounded-xl p-4"
    style={{ backgroundColor: `${color}11`, border: `1px solid ${color}33` }}
  >
    <div className="text-xs text-gray-400 mb-1">{label}</div>
    <div className="text-xl font-semibold tabular-nums" style={{ color }}>
      {value}
    </div>
  </div>
);

export default SportDetail;
