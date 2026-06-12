import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { useTheme } from '@/hooks/useTheme';
import AssessmentCard from '@/components/HealthAssessment/AssessmentCard';
import { assessHealth, type AssessmentBundle } from '@/utils/healthAssessment';
import styles from './style.module.css';

/**
 * 运动健康评估建议页 (2026-06-12)
 *
 * 路由: /health-assess
 * 数据源: health_stats.json (Apple HealthKit) + activities.json (运动记录)
 *
 * 不做医学判断（声明）
 * 数据局限: HRV 暂未提供日级别，训练负荷仅用 moving_time 估算
 */
const HealthAssessPage: React.FC = () => {
  const { theme } = useTheme();
  const [windowDays, setWindowDays] = useState<7 | 30>(7);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 评估计算（同步、纯函数，可重放）
  const bundle: AssessmentBundle = useMemo(
    () => assessHealth({ windowDays }),
    [windowDays]
  );

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

        {/* 综合建议 */}
        <section className={styles.overallSection}>
          <h2>综合建议</h2>
          <p className={styles.overallText}>{bundle.overall}</p>
        </section>

        {/* 评估卡片网格 */}
        <section className={styles.cardsGrid}>
          {bundle.cards.map((card) => (
            <AssessmentCard key={card.key} card={card} />
          ))}
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
