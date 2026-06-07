import { Link } from 'react-router-dom';
import type { SportTypeConfig } from '@/utils/sportTypes';

interface SportCardProps {
  sport: SportTypeConfig;
  count: number;
  totalDistance: number;     // 米
  totalTime: number;         // 秒
  lastDate?: string;         // 最近一次活动日期
  href: string;              // 点击进哪个页
}

/** 格式化秒 → "1h 23m" */
function formatTotalTime(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SportCard({
  sport,
  count,
  totalDistance,
  totalTime,
  lastDate,
  href,
}: SportCardProps) {
  const distKm = (totalDistance / 1000).toFixed(1);

  return (
    <Link
      to={href}
      className="sport-card group block rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: sport.colorBg,
        border: `1px solid ${sport.color}33`,
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${sport.color}88`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${sport.color}33`;
      }}
    >
      {/* 顶部：emoji + 标签 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{sport.emoji}</span>
          <span
            className="font-medium text-base"
            style={{ color: sport.color }}
          >
            {sport.label}
          </span>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${sport.color}22`,
            color: sport.color,
          }}
        >
          {count} 次
        </span>
      </div>

      {/* 中间：核心数据 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-baseline gap-2">
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: sport.color }}
          >
            {distKm}
          </span>
          <span className="text-xs text-gray-400">km</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>⏱ {formatTotalTime(totalTime)}</span>
          {lastDate && (
            <span className="text-gray-600">
              · {lastDate.slice(0, 10)}
            </span>
          )}
        </div>
      </div>

      {/* 底部：描述 */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: '#94a3b8' }}
      >
        {sport.desc}
      </p>
    </Link>
  );
}
