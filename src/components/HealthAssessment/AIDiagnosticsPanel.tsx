/**
 * v2.2.4 — AI 诊断面板 (折叠式)
 *
 * 点击展开 → fetch /api/health-check → 表格化展示 3 家 provider 状态
 * 失败时给可读错误 (5s 超时)
 */
import React, { useState } from 'react';
import {
  fetchHealthCheck,
  type HealthCheckResponse,
  type ProviderStatus,
} from '@/utils/healthCheckClient';
import styles from './AIDiagnosticsPanel.module.css';

interface Props {
  /** 错误回显用: 当 AI 调用失败时, 是否自动展开 */
  autoOpenOnError?: boolean;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  mimo: 'MiMo (小米)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const AIDiagnosticsPanel: React.FC<Props> = ({ autoOpenOnError = false }) => {
  const [open, setOpen] = useState(autoOpenOnError);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !fetched && !loading) {
      await loadStatus();
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchHealthCheck();
      setData(resp);
      setFetched(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <button
        className={styles.toggle}
        onClick={handleToggle}
        aria-expanded={open}
      >
        <span className={styles.chevron} data-open={open}>▸</span>
        <span>AI 配置诊断</span>
        {data && !loading && (
          <span
            className={`${styles.badge} ${data.activeReady ? styles.badgeOk : styles.badgeWarn}`}
          >
            {data.activeReady ? '✓ Ready' : '⚠ 未就绪'}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.body}>
          {loading && <p className={styles.muted}>正在检测…</p>}

          {error && (
            <p className={styles.error}>
              ❌ 检测失败：{error}
              <button onClick={loadStatus} className={styles.retryBtn}>
                重试
              </button>
            </p>
          )}

          {data && !loading && (
            <>
              <p className={styles.summary}>
                <strong>当前激活：</strong>
                <code className={styles.code}>{data.activeProvider}</code>
                {' · '}
                <code className={styles.code}>{data.activeModel}</code>
                {!data.activeReady && (
                  <span className={styles.notReady}>（未就绪）</span>
                )}
              </p>

              {!data.activeReady && data.hint && (
                <p className={styles.hint}>💡 {data.hint}</p>
              )}

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>环境变量</th>
                    <th>状态</th>
                    <th>模型</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p: ProviderStatus) => (
                    <tr
                      key={p.name}
                      className={p.isActive ? styles.activeRow : ''}
                    >
                      <td>
                        {PROVIDER_DISPLAY_NAMES[p.name] ?? p.name}
                        {p.isActive && <span className={styles.activeTag}>· 激活</span>}
                      </td>
                      <td>
                        <code className={styles.code}>{p.envKeyName}</code>
                      </td>
                      <td>
                        {p.hasKey ? (
                          <span className={styles.hasKey}>✓ 已配置</span>
                        ) : (
                          <span className={styles.noKey}>✗ 未配置</span>
                        )}
                      </td>
                      <td>
                        <code className={styles.code}>{p.model}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className={styles.footer}>
                切换 provider: 修改 Vercel 环境变量 <code className={styles.code}>LLM_PROVIDER</code> 即可，
                详见{' '}
                <a
                  href="https://github.com/wuleiyuan/sports-fair#ai-health-assessment-llm--v220"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  README LLM 配置章节
                </a>
                。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AIDiagnosticsPanel;
