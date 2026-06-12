import React from 'react';
import type { AssessmentCard as AssessmentCardType } from '@/utils/healthAssessment';
import SeverityBadge from './SeverityBadge';

interface Props {
  card: AssessmentCardType;
  /** v2.1.9: 训练负荷 7 天趋势 (仅 training_load 卡片使用) */
  trend?: number[];
  /** v2.1.9: 趋势柱状图最大高度归一化值 */
  trendMax?: number;
  /** v2.1.9: ACWR 区间色带相关 */
  acwrRatio?: number;
}

/**
 * v2.1.9: 训练负荷 ACWR 区间色带配置
 * - 0.0-0.8 紫 = 恢复期 (Detraining)
 * - 0.8-1.3 绿 = 最佳提升 (Optimal)
 * - 1.3-1.5 橙 = 过度训练 (Overreaching)
 * - 1.5+   蓝 = 高危预警 (High Risk)
 */
const ACWR_ZONES = [
  { min: 0,    max: 0.8,  color: '#a855f7', label: '恢复期',     cn: 'Detraining' },
  { min: 0.8,  max: 1.3,  color: '#22c55e', label: '最佳提升',   cn: 'Optimal' },
  { min: 1.3,  max: 1.5,  color: '#f97316', label: '过度训练',   cn: 'Overreaching' },
  { min: 1.5,  max: 99,   color: '#3b82f6', label: '高危预警',   cn: 'High Risk' },
];

/**
 * 根据 ACWR ratio 返回当前 zone + 静态 AI 风格建议
 */
function acwrZone(ratio: number) {
  if (ratio <= 0) return { zone: ACWR_ZONES[0], staticAdvice: '近 28 天无训练记录。从低强度（步行 3km）开始恢复。' };
  if (ratio < 0.8) return {
    zone: ACWR_ZONES[0],
    staticAdvice: '当前训练负荷偏低，长期维持可能影响体能提升。建议每周增加 1 次中等强度训练（30 分钟慢跑或骑行）。',
  };
  if (ratio <= 1.3) return {
    zone: ACWR_ZONES[1],
    staticAdvice: '维持训练：当前处于伤病风险最低且体能提升最快的区间。建议保持周训练量稳定。',
  };
  if (ratio <= 1.5) return {
    zone: ACWR_ZONES[2],
    staticAdvice: '建议本周减少 20% 训练量：增加 1-2 天主动恢复（散步/拉伸），高强度训练减半。',
  };
  return {
    zone: ACWR_ZONES[3],
    staticAdvice: '紧急减量：建议立即减量 50% 或完全休息 1-2 天。监测 RHR 与睡眠，警惕受伤信号。',
  };
}

/**
 * 单个评估卡片
 * - 严重程度徽章 (SeverityBadge)
 * - 标题 + 主指标 + 副指标
 * - 建议文本（高亮显示）
 * - 可折叠 detail（鼠标悬停展开）
 * - v2.1.9: 训练负荷卡片显示 ACWR 区间色带 + 静态 AI 建议
 */
const AssessmentCard: React.FC<Props> = ({ card, trend, trendMax, acwrRatio }) => {
  const isTrainingLoad = card.key === 'training_load';
  const showTrend = isTrainingLoad && trend && trend.length === 7;
  const maxBar = trendMax && trendMax > 0 ? trendMax : 1;
  const trendLabels = ['6天前', '5天前', '4天前', '3天前', '2天前', '昨天', '今'];

  // ACWR 区间色带：固定 0-2.0 范围，position = ratio/2
  const acwrDisplayMax = 2.0;
  const acwrPercent = isTrainingLoad && acwrRatio && acwrRatio > 0
    ? Math.min(100, (acwrRatio / acwrDisplayMax) * 100)
    : 0;

  return (
    <div
      className={`assessment-card severity-${card.severity}`}
      style={{
        backgroundColor: 'var(--color-card-bg, #fff)',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderLeft: `4px solid ${
          card.severity === 'good'
            ? '#4caf50'
            : card.severity === 'watch'
              ? '#ffc107'
              : card.severity === 'warn'
                ? '#ff9800'
                : '#f44336'
        }`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{card.title}</h3>
        <SeverityBadge severity={card.severity} size="sm" />
      </div>

      <div>
        <div
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            color: 'var(--color-text-primary, #222)',
            lineHeight: 1.2,
          }}
        >
          {card.main}
        </div>
        {card.sub && (
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary, #666)',
              marginTop: 4,
            }}
          >
            {card.sub}
          </div>
        )}
      </div>

      {/* v2.1.9: 训练负荷 ACWR 区间色带 + 状态评级 */}
      {isTrainingLoad && acwrRatio !== undefined && acwrRatio > 0 && (() => {
        const { zone, staticAdvice } = acwrZone(acwrRatio);
        return (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #888)', marginBottom: 6 }}>
              ACWR 风险区间（0-2.0）
            </div>
            <div className="acwr-zone-bar">
              {ACWR_ZONES.map((z, i) => {
                // width 百分比: 紫 0-0.8 (40%) / 绿 0.8-1.3 (25%) / 橙 1.3-1.5 (10%) / 蓝 1.5+ (25%)
                const TOTAL_SPAN = 0.8 + 0.5 + 0.2 + 0.5; // = 2.0
                const span = z.max === 99 ? 0.5 : (z.max - z.min);
                const widthPct = (span / TOTAL_SPAN) * 100;
                return (
                  <div
                    key={i}
                    className="acwr-zone"
                    style={{ backgroundColor: z.color, width: `${widthPct}%` }}
                  />
                );
              })}
            </div>
            <div className="acwr-zone-labels">
              {ACWR_ZONES.map((z, i) => {
                const TOTAL_SPAN = 0.8 + 0.5 + 0.2 + 0.5;
                const span = z.max === 99 ? 0.5 : (z.max - z.min);
                const widthPct = (span / TOTAL_SPAN) * 100;
                return (
                  <span
                    key={i}
                    className="acwr-zone-label"
                    style={{ color: z.color, width: `${widthPct}%` }}
                  >
                    {z.min}-{z.max === 99 ? '∞' : z.max}
                  </span>
                );
              })}
            </div>
            <div
              className="acwr-marker-wrap"
              style={{
                position: 'relative',
                height: 14,
                margin: '6px 0 10px',
                borderTop: '1px dashed rgba(0,0,0,0.08)',
              }}
            >
              <div
                className="acwr-marker-dot"
                style={{
                  position: 'absolute',
                  left: `${acwrPercent}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: zone.color,
                  border: '2px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                }}
                title={`ACWR = ${acwrRatio.toFixed(2)}`}
              />
            </div>
            <div className="acwr-status-row">
              <span
                className="acwr-status-label"
                style={{ backgroundColor: zone.color }}
              >
                {zone.label}
              </span>
              <span className="acwr-status-en">{zone.cn}</span>
            </div>
            {/* 静态 AI 建议（v2.2.0 替换为真实 LLM 输出） */}
            <div
              className="ai-guidance"
              style={{
                padding: '10px 12px',
                marginTop: 8,
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%)',
                borderRadius: 6,
                borderLeft: '3px solid #6366f1',
                fontSize: '0.85rem',
                color: 'var(--color-text-primary, #1a1a1a)',
                lineHeight: 1.5,
              }}
            >
              <span
                className="ai-badge"
                style={{
                  display: 'inline-block',
                  fontSize: '0.7rem',
                  background: '#6366f1',
                  color: 'white',
                  padding: '1px 8px',
                  borderRadius: 8,
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                🤖 AI 教练建议
              </span>
              <p style={{ margin: 0 }}>{staticAdvice}</p>
            </div>
          </div>
        );
      })()}

      <div
        className="advice"
        style={{
          padding: '10px 12px',
          borderRadius: 6,
          color: '#1a1a1a',
          fontWeight: 500,
          backgroundColor:
            card.severity === 'good'
              ? 'rgba(76, 175, 80, 0.06)'
              : card.severity === 'watch'
                ? 'rgba(255, 193, 7, 0.08)'
                : card.severity === 'warn'
                  ? 'rgba(255, 152, 0, 0.10)'
                  : 'rgba(244, 67, 54, 0.08)',
          fontSize: '0.9rem',
          lineHeight: 1.5,
        }}
      >
        {card.advice}
      </div>

      {card.detail && (
        <details
          style={{
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary, #888)',
            marginTop: 4,
          }}
        >
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>说明 / 数据局限</summary>
          <p style={{ marginTop: 8, lineHeight: 1.5 }}>{card.detail}</p>
        </details>
      )}
    </div>
  );
};

export default AssessmentCard;
