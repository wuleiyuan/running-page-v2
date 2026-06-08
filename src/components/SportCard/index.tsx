// 运动卡片 - 中等改造第四阶段
// 加 hover 动画、未解锁灰态、距离按单位偏好显示

import { Link } from 'react-router-dom';
import type { SportCompat } from '@/utils/sportCompat';

interface SportCardProps {
  sport: SportCompat;
  count: number;             // 活动次数
  totalDistance: number;     // 米
  totalTime: number;         // 秒
  lastDate?: string;         // 最近一次活动日期
  href: string;              // 点击进哪个页
}

/** 格式化秒 → "1h 23m" / "23m" */
function formatTotalTime(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** 距离格式化：按 sport.unit 偏好 */
function formatDistance(meters: number, unit: 'km' | 'mi' | 'm'): string {
  if (unit === 'm') return meters.toFixed(0); // 游泳用米
  if (unit === 'mi') return (meters / 1609.344).toFixed(1);
  return (meters / 1000).toFixed(1); // km
}

function formatUnit(unit: 'km' | 'mi' | 'm'): string {
  if (unit === 'm') return 'm';
  if (unit === 'mi') return 'mi';
  return 'km';
}

export default function SportCard({
  sport,
  count,
  totalDistance,
  totalTime,
  lastDate,
  href,
}: SportCardProps) {
  const locked = count === 0;
  const dist = formatDistance(totalDistance, sport.unit);
  const unit = formatUnit(sport.unit);

  return (
    <Link
      to={locked ? '#' : href}
      onClick={(e) => {
        if (locked) e.preventDefault();
      }}
      className={`sport-card group block rounded-2xl p-5 transition-all duration-200 ${
        locked
          ? 'opacity-50 cursor-not-allowed grayscale'
          : 'hover:-translate-y-1 hover:shadow-2xl cursor-pointer'
      }`}
      style={{
        backgroundColor: locked ? 'rgba(40, 40, 40, 0.4)' : sport.colorBg,
        border: locked
          ? '1px dashed rgba(148, 163, 184, 0.25)'
          : `1px solid ${sport.color}33`,
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        if (locked) return;
        e.currentTarget.style.borderColor = `${sport.color}88`;
        e.currentTarget.style.boxShadow = `0 12px 32px -8px ${sport.color}44`;
      }}
      onMouseLeave={(e) => {
        if (locked) return;
        e.currentTarget.style.borderColor = `${sport.color}33`;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* 顶部：emoji + 标签 + 状态徽章 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-2xl ${locked ? 'grayscale' : ''}`}>{sport.emoji}</span>
          <span
            className="font-medium text-base"
            style={{ color: locked ? '#64748b' : sport.color }}
          >
            {sport.label}
          </span>
        </div>
        {locked ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
            未解锁
          </span>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${sport.color}22`,
              color: sport.color,
            }}
          >
            {count.toLocaleString()} 次
          </span>
        )}
      </div>

      {/* 中间：核心数据 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-baseline gap-2">
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: locked ? '#475569' : sport.color }}
          >
            {dist}
          </span>
          <span className="text-xs text-gray-400">{unit}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>⏱ {formatTotalTime(totalTime)}</span>
          {!locked && lastDate && (
            <span className="text-gray-600">· {lastDate.slice(0, 10)}</span>
          )}
        </div>
      </div>

      {/* 底部：描述 或 鼓励语 */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: locked ? '#475569' : '#94a3b8' }}
      >
        {locked ? `解锁 ${sport.label}，开启你的「${sport.desc.split('，')[0]}」` : sport.desc}
      </p>
    </Link>
  );
}
