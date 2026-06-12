import {
  formatPace,
  titleForRun,
  formatRunTime,
  Activity,
  RunIds,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { M_TO_DIST, M_TO_ELEV } from '@/utils/utils';
import { getDisplayMetric } from '@/utils/activitiesDisplay';
import styles from './style.module.css';

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  setRunIndex: (_ndex: number) => void;
}

const RunRow = ({
  elementIndex,
  locateActivity,
  run,
  runIndex,
  setRunIndex,
}: IRunRowProperties) => {
  // 2026-06-12: 用 activitiesDisplay 决定显示指标
  // - distance 维度：距离 + 配速
  // - count 维度：次数（如爬楼层数）+ 时长
  // - duration 维度：时长 + 心率
  const display = getDisplayMetric(run);
  const distance = (run.distance / M_TO_DIST).toFixed(2); // 保留旧字段（向后兼容）
  const paceParts = run.average_speed ? formatPace(run.average_speed) : null;
  const heartRate = run.average_heartrate;
  const runTime = formatRunTime(run.moving_time);
  const handleClick = () => {
    if (runIndex === elementIndex) {
      setRunIndex(-1);
      locateActivity([]);
      return;
    }
    setRunIndex(elementIndex);
    locateActivity([run.run_id]);
  };

  return (
    <tr
      className={`${styles.runRow} ${runIndex === elementIndex ? styles.selected : ''} ${
        display.anomaly ? styles[display.anomaly] || '' : ''
      }`}
      key={run.start_date_local}
      onClick={handleClick}
      title={display.anomalyReason || ''}
    >
      <td>{titleForRun(run)}</td>
      <td>{display.value}</td>
      {SHOW_ELEVATION_GAIN && (
        <td>{((run.elevation_gain ?? 0) * M_TO_ELEV).toFixed(1)}</td>
      )}
      {paceParts && <td>{paceParts}</td>}
      <td>{heartRate && heartRate.toFixed(0)}</td>
      <td>{runTime}</td>
      <td className={styles.runDate}>{run.start_date_local}</td>
    </tr>
  );
};

export default RunRow;
