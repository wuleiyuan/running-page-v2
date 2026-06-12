import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { useTheme } from '@/hooks/useTheme';
import styles from './style.module.css';

// 2026-06-10: 健康分析页（HR / RHR / HRV / 睡眠 / 步数）
// 数据源：run_page/health_stats.py 生成的 src/static/health_stats.json
// SVG dashboard：run_page/health_svg.py 生成的 assets/health.svg
import healthStats from '@/static/health_stats.json';
// Vite 会把 assets/*.svg 打包到 dist，?url 拿到最终 URL
import healthSvgUrl from '@assets/health.svg?url';

interface TopStats {
  hr: { mean_all: number; median: number; max_ever: number; days_with_data: number };
  rhr: { mean_all: number; median: number; min_ever: number; days_with_data: number };
  hrv: { mean_all: number; median: number; days_with_data: number };
  sleep: { median_hours: number; days_with_data: number };
  steps: { mean_daily: number; median_daily: number; total: number; days_with_data: number };
}

interface YearStat {
  hr_mean?: number;
  sleep_median_h?: number;
  steps_mean_daily?: number;
  steps_total?: number;
  hrv_mean?: number;
  days_with_data: number;
}

interface HealthStats {
  generated_at: string;
  top_stats: TopStats;
  by_year: Record<string, YearStat>;
  daily: Record<string, any>;
}

const HealthPage: React.FC = () => {
  const { theme } = useTheme();
  const data = healthStats as HealthStats;
  const [showSvg, setShowSvg] = useState(true);

  useEffect(() => {
    const htmlElement = document.documentElement;
    htmlElement.setAttribute('data-theme', theme);
  }, [theme]);

  const yearKeys = useMemo(
    () => Object.keys(data.by_year).sort((a, b) => Number(b) - Number(a)),
    [data]
  );

  // 2026-06-12: client-side 异常值防御（双保险，根因在 health_stats.py）
  // - 2026 HR 99.4 可能是手环记录了运动中 HR 而非静息
  // - 2023 睡眠 11.09h 可能是手环没摘
  // 展示端做一次合理性过滤，不合理的值改用 "—" 显示
  const safeByYear = useMemo(() => {
    const out: Record<string, YearStat> = {};
    for (const [y, s] of Object.entries(data.by_year)) {
      out[y] = {
        ...s,
        hr_mean: s.hr_mean !== undefined && s.hr_mean >= 30 && s.hr_mean <= 220 ? s.hr_mean : undefined,
        hrv_mean: s.hrv_mean !== undefined && s.hrv_mean >= 10 && s.hrv_mean <= 200 ? s.hrv_mean : undefined,
        sleep_median_h: s.sleep_median_h !== undefined && s.sleep_median_h >= 1 && s.sleep_median_h <= 14 ? s.sleep_median_h : undefined,
      };
    }
    return out;
  }, [data]);

  const ts = data.top_stats;

  return (
    <Layout>
      <Helmet>
        <title>健康分析 · Sports Fair</title>
        <html lang="zh-CN" data-theme={theme} />
      </Helmet>

      <div className={styles.healthPage}>
        <header className={styles.header}>
          <h1>健康分析</h1>
          <p className={styles.subtitle}>
            数据来源 Apple HealthKit（2020-05 → {data.generated_at.slice(0, 10)}）
          </p>
        </header>

        {/* 顶部核心指标卡片 */}
        <section className={styles.statsGrid}>
          <StatCard
            title="心率（HR）"
            main={`${ts.hr.median.toFixed(1)} bpm`}
            sub={`均值 ${ts.hr.mean_all.toFixed(1)} · 历史最高 ${ts.hr.max_ever.toFixed(0)}`}
            footnote={`${ts.hr.days_with_data} 天有数据`}
          />
          <StatCard
            title="静息心率（RHR）"
            main={`${ts.rhr.median.toFixed(1)} bpm`}
            sub={`均值 ${ts.rhr.mean_all.toFixed(1)} · 历史最低 ${ts.rhr.min_ever.toFixed(0)}`}
            footnote={`${ts.rhr.days_with_data} 天有数据`}
          />
          <StatCard
            title="心率变异性（HRV）"
            main={`${ts.hrv.median.toFixed(1)} ms`}
            sub={`均值 ${ts.hrv.mean_all.toFixed(1)}`}
            footnote={`${ts.hrv.days_with_data} 天有数据`}
          />
          <StatCard
            title="睡眠"
            main={`${ts.sleep.median_hours.toFixed(2)} h`}
            sub="中位数每晚"
            footnote={`${ts.sleep.days_with_data} 晚有数据`}
          />
          <StatCard
            title="步数"
            main={`${(ts.steps.total / 10000).toFixed(0)} 万`}
            sub={`日均 ${ts.steps.mean_daily.toLocaleString()} · 中位数 ${ts.steps.median_daily.toLocaleString()}`}
            footnote={`${ts.steps.days_with_data} 天有数据`}
          />
        </section>

        {/* 按年汇总 */}
        <section className={styles.yearSection}>
          <h2>按年汇总</h2>
          <table className={styles.yearTable}>
            <thead>
              <tr>
                <th>年份</th>
                <th>HR 均值 (bpm)</th>
                <th>HRV 均值 (ms)</th>
                <th>睡眠中位 (h)</th>
                <th>日均步数</th>
                <th>总步数 (万)</th>
                <th>有数据天</th>
              </tr>
            </thead>
            <tbody>
              {yearKeys.map((y) => {
                const s = safeByYear[y];
                return (
                  <tr key={y}>
                    <td>{y}</td>
                    <td>{s.hr_mean?.toFixed(1) ?? '—'}</td>
                    <td>{s.hrv_mean?.toFixed(1) ?? '—'}</td>
                    <td>{s.sleep_median_h?.toFixed(2) ?? '—'}</td>
                    <td>{s.steps_mean_daily?.toLocaleString() ?? '—'}</td>
                    <td>{((s.steps_total ?? 0) / 10000).toFixed(0)}</td>
                    <td>{s.days_with_data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* 切换 dashboard */}
        <section className={styles.toggleSection}>
          <button
            className={styles.toggleBtn}
            onClick={() => setShowSvg((v) => !v)}
          >
            {showSvg ? '隐藏可视化' : '显示可视化'}
          </button>
        </section>

        {showSvg && (
          <section className={styles.svgSection}>
            <h2>Dashboard</h2>
            <object
              data={healthSvgUrl}
              type="image/svg+xml"
              className={styles.svgEmbed}
              aria-label="Health dashboard"
            >
              <a href={healthSvgUrl}>下载 health.svg</a>
            </object>
          </section>
        )}
      </div>
    </Layout>
  );
};

const StatCard: React.FC<{
  title: string;
  main: string;
  sub: string;
  footnote: string;
}> = ({ title, main, sub, footnote }) => (
  <div className={styles.statCard}>
    <div className={styles.statTitle}>{title}</div>
    <div className={styles.statMain}>{main}</div>
    <div className={styles.statSub}>{sub}</div>
    <div className={styles.statFootnote}>{footnote}</div>
  </div>
);

export default HealthPage;