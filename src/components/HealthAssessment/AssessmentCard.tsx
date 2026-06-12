import React from 'react';
import type { AssessmentCard as AssessmentCardType } from '@/utils/healthAssessment';
import SeverityBadge from './SeverityBadge';

interface Props {
  card: AssessmentCardType;
}

/**
 * 单个评估卡片
 * - 严重程度徽章 (SeverityBadge)
 * - 标题 + 主指标 + 副指标
 * - 建议文本（高亮显示）
 * - 可折叠 detail（鼠标悬停展开）
 */
const AssessmentCard: React.FC<Props> = ({ card }) => {
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
