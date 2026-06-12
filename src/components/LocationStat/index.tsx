import YearStat from '@/components/YearStat';
import {
  CHINESE_LOCATION_INFO_MESSAGE_FIRST,
  CHINESE_LOCATION_INFO_MESSAGE_SECOND,
} from '@/utils/const';
import CitiesStat from './CitiesStat';
import LocationSummary from './LocationSummary';
import PeriodStat from './PeriodStat';

interface ILocationStatProps {
  changeYear: (_year: string) => void;
  changeCity: (_city: string) => void;
  changeTitle: (_title: string) => void;
  // 2026-06-12: 当前选中的 sport key，'All' = 全集，'Run' / 'Hiking' 等 = 单 sport
  // 用于 PeriodStat / YearStat 过滤时段和年度统计
  sportKey?: 'All' | string;
}

const LocationStat = ({
  changeYear,
  changeCity,
  changeTitle,
  sportKey = 'All',
}: ILocationStatProps) => (
  <div className="w-full pb-16 lg:w-full lg:pr-16">
    <section className="pb-0">
      <p className="leading-relaxed">
        {CHINESE_LOCATION_INFO_MESSAGE_FIRST}
        .
        <br />
        {CHINESE_LOCATION_INFO_MESSAGE_SECOND}
        .
        <br />
        <br />
        Yesterday you said tomorrow.
      </p>
    </section>
    <hr />
    <LocationSummary />
    <CitiesStat onClick={changeCity} />
    <PeriodStat onClick={changeTitle} sportKey={sportKey} />
    <YearStat year="Total" onClick={changeYear} sportKey={sportKey} />
  </div>
);

export default LocationStat;
