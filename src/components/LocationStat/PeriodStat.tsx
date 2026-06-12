import Stat from '@/components/Stat';
import useActivities, { getRunPeriodBySport } from '@/hooks/useActivities';

const PeriodStat = ({
  onClick,
  sportKey = 'All',
}: {
  onClick: (_period: string) => void;
  sportKey?: 'All' | string;
}) => {
  const { activities } = useActivities();
  // 2026-06-12: 按 sportKey 过滤时段分布
  // 主页 sportKey='Run' 时只显示 "清晨跑步/傍晚跑步/半程马拉松" 等 Run 时段
  // 不再混入 "爬楼 Stairs" / "跳绳 Rope Skipping" / "瑜伽" 等非 Run 桶
  const runPeriod = getRunPeriodBySport(activities, sportKey);

  const periodArr = Object.entries(runPeriod);
  periodArr.sort((a, b) => b[1] - a[1]);
  return (
    <div className="cursor-pointer">
      <section>
        {periodArr.map(([period, times]) => (
          <Stat
            key={period}
            value={period}
            description={` ${times} 次`}
            citySize={3}
            onClick={() => onClick(period)}
          />
        ))}
      </section>
      <hr />
    </div>
  );
};

export default PeriodStat;
