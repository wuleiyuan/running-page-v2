import React from 'react';
import type { Severity } from '@/utils/healthAssessment';

interface Props {
  severity: Severity;
  size?: 'sm' | 'md';
}

/**
 * 严重程度徽章
 * - good:   绿色 ✓
 * - watch:  黄色 ⚠
 * - warn:   橙色 ⚠
 * - urgent: 红色 ✕
 */
const SeverityBadge: React.FC<Props> = ({ severity, size = 'md' }) => {
  const config: Record<Severity, { label: string; color: string; icon: string }> = {
    good: { label: '良好', color: '#4caf50', icon: '✓' },
    watch: { label: '关注', color: '#ffc107', icon: '⚠' },
    warn: { label: '警告', color: '#ff9800', icon: '⚠' },
    urgent: { label: '紧急', color: '#f44336', icon: '✕' },
  };
  const c = config[severity];
  return (
    <span
      className={`severity-badge severity-${severity} severity-${size}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        borderRadius: 12,
        backgroundColor: `${c.color}20`,
        color: c.color,
        fontSize: size === 'sm' ? '0.75rem' : '0.85rem',
        fontWeight: 600,
        border: `1px solid ${c.color}40`,
      }}
    >
      <span aria-hidden>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
};

export default SeverityBadge;
