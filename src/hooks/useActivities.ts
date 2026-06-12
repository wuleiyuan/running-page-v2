import { useMemo } from 'react';
import { locationForRun, titleForRun } from '@/utils/utils';
import activities from '@/static/activities.json';
import { COUNTRY_STANDARDIZATION } from '@/static/city';
import { normalizeSportTypeCompat } from '@/utils/sportCompat';

const standardizeCountryName = (country: string): string => {
  for (const [pattern, standardName] of COUNTRY_STANDARDIZATION) {
    if (country.includes(pattern)) {
      return standardName;
    }
  }
  return country;
};

const useActivities = () => {
  const processedData = useMemo(() => {
    const cities: Record<string, number> = {};
    const runPeriod: Record<string, number> = {};
    const provinces: Set<string> = new Set();
    const countries: Set<string> = new Set();
    const years: Set<string> = new Set();

    activities.forEach((run) => {
      const location = locationForRun(run);

      const periodName = titleForRun(run);
      if (periodName) {
        runPeriod[periodName] = runPeriod[periodName]
          ? runPeriod[periodName] + 1
          : 1;
      }

      const { city, province, country } = location;
      // drop only one char city
      if (city.length > 1) {
        cities[city] = cities[city]
          ? cities[city] + run.distance
          : run.distance;
      }
      if (province) provinces.add(province);
      if (country) countries.add(standardizeCountryName(country));
      const year = run.start_date_local.slice(0, 4);
      years.add(year);
    });

    const yearsArray = [...years].sort().reverse();
    const thisYear = yearsArray[0] || '';

    return {
      activities,
      years: yearsArray,
      countries: [...countries],
      provinces: [...provinces],
      cities,
      runPeriod,
      thisYear,
    };
  }, []); // Empty dependency array since activities is static

  return processedData;
};

/**
 * 2026-06-12: 按 sport key 过滤的 activities 视图
 * 用途：PeriodStat / YearStat / SportsOverview 等需要按运动类型显示统计
 * 'All' = 全集（保持向后兼容）
 * 'Run' / 'Hiking' / 'Walk' / 'Ride' / 'RopeSkipping' / 'StairStepper' = 单 sport
 */
export const useSportActivities = (sportKey: 'All' | string = 'All') => {
  const { activities: all } = useActivities();
  return useMemo(() => {
    if (sportKey === 'All') return all;
    return (all as unknown as Activity[]).filter(
      (a) => normalizeSportTypeCompat(a.type, a.name) === sportKey
    );
  }, [all, sportKey]);
};

/**
 * 2026-06-12: 按 sport key 过滤的 runPeriod（时段分布）
 * 用途：PeriodStat 加 sportKey prop 后调用
 */
export const getRunPeriodBySport = (
  activities: Activity[],
  sportKey: 'All' | string
): Record<string, number> => {
  const filtered =
    sportKey === 'All'
      ? activities
      : activities.filter(
          (a) => normalizeSportTypeCompat(a.type, a.name) === sportKey
        );
  const period: Record<string, number> = {};
  filtered.forEach((run) => {
    const name = titleForRun(run);
    if (name) {
      period[name] = (period[name] || 0) + 1;
    }
  });
  return period;
};

export default useActivities;
