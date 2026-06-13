import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { useTheme } from '@/hooks/useTheme';
import AssessmentCard from '@/components/HealthAssessment/AssessmentCard';
import AIDiagnosticsPanel from '@/components/HealthAssessment/AIDiagnosticsPanel';
import {
  assessHealth,
  fetchAIGuidanceWithCache,
  loadProviderPref,
  saveProviderPref,
  type AssessmentBundle,
  type AIGuidanceResponse,
  type LLMProvider,
} from '@/utils/healthAssessment';
import styles from './style.module.css';

/**
 * 运动健康评估建议页 (2026-06-12)
 * v2.2.0: 接入 LLM (MiMo) 替换静态 overall 建议
 * v2.2.1: 支持 LLM provider 切换 (mimo / openai / anthropic)
 * v2.2.3: localStorage 24h 缓存 + provider 偏好记忆 + 空数据兜底
 *
 * 路由: /health-assess
 * 数据源: health_stats.json (Apple HealthKit) + activities.json (运动记录)
 * AI 源: /api/assess-ai (Vercel Function → LLM Provider)
 *
 * 不做医学判断（声明）
 * 数据局限: HRV 暂未提供日级别，训练负荷仅用 moving_time 估算
 */
const PROVIDER_LABELS: Record<LLMProvider, string> = {
  mimo: 'MiMo (小米)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const HealthAssessPage: React.FC = () => {
  const { theme } = useTheme();
  const [windowDays, setWindowDays] = useState<7 | 30>(7);

  // v2.2.3: 读 localStorage 恢复 provider 偏好
  const [provider, setProviderState] = useState<LLMProvider>(() => loadProviderPref());

  // v2.2.0: AI 建议状态
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [aiResponse, setAiResponse] = useState<AIGuidanceResponse | null>(null);
  /** v2.2.3: 标记本次响应来自 cache, 避免重复点重试 */
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 评估计算（同步、纯函数，可重放）
  const bundle: AssessmentBundle = useMemo(
    () => assessHealth({ windowDays }),
    [windowDays]
  );

  // v2.2.3: 包装 setProvider 同步写 localStorage
  const setProvider = (p: LLMProvider) => {
    setProviderState(p);
    saveProviderPref(p);
  };

  // v2.2.0/2.2.3: bundle 或 provider 变就拉 AI 建议 (走 cache)
  useEffect(() => {
    let cancelled = false;
    setAiState('loading');
    setAiResponse(null);
    setFromCache(false);

    fetchAIGuidanceWithCache(bundle, { provider }).then(({ response, fromCache: isCached }) => {
      if (cancelled) return;
      setAiResponse(response);
      setFromCache(isCached);
      if (response.aiGuidance && response.aiGuidance.trim().length > 0) {
        setAiState('ok');
      } else {
        setAiState('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bundle, provider]);

  // v2.2.3: 边缘 case - 评估数据全空/异常时, AI 提示用户先录入数据
  const isEmptyData = bundle.cards.every((c) => c.main === 'N/A' || c.main === '无数据');

  return (
    <Layout>
      <Helmet>
        <title>运动健康评估建议 · Sports Fair</title>
        <html lang="zh-CN" data-theme={theme} />
      </Helmet>

      <div className={styles.healthAssessPage}>
        <header className={styles.header}>
          <h1>运动健康评估建议</h1>
          <p className={styles.subtitle}>
            基于 Apple HealthKit（{bundle.windowDays} 天窗口）+ 训练记录综合分析
          </p>
        </header>

        {/* 时间窗口切换 */}
        <div className={styles.windowSwitcher}>
          <button
            className={`${styles.switchBtn} ${windowDays === 7 ? styles.active : ''}`}
            onClick={() => setWindowDays(7)}
          >
            近 7 天
          </button>
          <button
            className={`${styles.switchBtn} ${windowDays === 30 ? styles.active : ''}`}
            onClick={() => setWindowDays(30)}
          >
            近 30 天
          </button>
        </div>

        {/* v2.2.1: LLM provider 切换器 */}
        <div className={styles.providerSwitcher}>
          <span className={styles.providerLabel}>AI 模型：</span>
          {(Object.keys(PROVIDER_LABELS) as LLMProvider[]).map((p) => (
            <button
              key={p}
              className={`${styles.providerBtn} ${provider === p ? styles.active : ''}`}
              onClick={() => setProvider(p)}
              title={`使用 ${PROVIDER_LABELS[p]} 生成建议`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        {/* v2.2.3: 空数据友好提示 */}
        {isEmptyData && (
          <section className={styles.emptyDataBanner}>
            <p>
              ⚠️ <strong>暂无可评估数据</strong>。
              请先同步 Apple HealthKit 数据，或导入运动记录（GPX / TCX / FIT 文件）。
            </p>
            <p className={styles.emptyDataSub}>
              健康评估需要至少 {windowDays} 天的 {bundle.cards.length} 项核心指标。
            </p>
          </section>
        )}

        {/* v2.2.4: AI 配置诊断面板 - AI 出错时自动展开 */}
        <AIDiagnosticsPanel autoOpenOnError={aiState === 'error'} />

        {/* 综合建议 (v2.2.0: 优先显示 LLM 个性化建议) */}
        <section className={styles.overallSection}>
          <div className={styles.overallHeader}>
            <h2>
              {aiState === 'ok' ? '🤖 AI 个性化建议' : '综合建议'}
            </h2>
            {aiState === 'ok' && aiResponse?.model && (
              <span
                className={styles.aiBadge}
                title={`由 ${PROVIDER_LABELS[aiResponse.provider ?? 'mimo']} 提供${fromCache ? '（来自本地缓存）' : ''}`}
              >
                {PROVIDER_LABELS[aiResponse.provider ?? 'mimo']} · {aiResponse.model}
                {fromCache && <span className={styles.cacheMark}> · 📦cached</span>}
              </span>
            )}
          </div>
          {aiState === 'loading' && (
            <p className={styles.overallText}>
              <span className={styles.aiLoading}>
                <span className={styles.dotPulse} /> AI 教练正在分析你的数据…
              </span>
            </p>
          )}
          {aiState === 'ok' && aiResponse?.aiGuidance && (
            <div className={styles.overallText}>
              {aiResponse.aiGuidance.split('\n').filter((l) => l.trim()).map((line, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '0.5em 0 0' }}>
                  {line}
                </p>
              ))}
            </div>
          )}
          {aiState === 'error' && (
            <>
              <p className={styles.overallText}>{bundle.overall}</p>
              <p className={styles.aiFallback}>
                （AI 建议暂不可用
                {aiResponse?.requestId && <code className={styles.requestId}> [{aiResponse.requestId.slice(0, 8)}]</code>}
                ：{aiResponse?.error || '未知错误'}，已显示静态建议。请展开上方 "AI 配置诊断" 排查。）
              </p>
              {aiResponse?.hint && (
                <p className={styles.aiHint}>
                  💡 {aiResponse.hint}
                </p>
              )}
            </>
          )}
        </section>

        {/* 评估卡片网格 */}
        <section className={styles.cardsGrid}>
          {bundle.cards.map((card) => {
            const isTrainingLoad = card.key === 'training_load';
            const acwrRatio = isTrainingLoad ? parseFloat(card.main) || 0 : 0;
            return (
              <AssessmentCard
                key={card.key}
                card={card}
                acwrRatio={isTrainingLoad ? acwrRatio : undefined}
              />
            );
          })}
        </section>

        {/* 医学免责声明 */}
        <footer className={styles.disclaimer}>
          <p>
            ⚠️ <strong>声明：</strong>本评估基于公开医学/运动科学文献区间（AHA / NSF /
            ACWR），仅作参考。 不替代医生意见。如有健康疑虑，请咨询专业医生。
          </p>
          <p className={styles.timestamp}>
            生成于 {new Date(bundle.generatedAt).toLocaleString('zh-CN')} · 数据局限见各卡片
            "说明" 部分
          </p>
        </footer>
      </div>
    </Layout>
  );
};

export default HealthAssessPage;
