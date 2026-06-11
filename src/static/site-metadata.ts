interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: 'Sports Fair - 运动集市',
  siteUrl: 'https://running-page-v2.vercel.app',
  logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQTtc69JxHNcmN1ETpMUX4dozAgAN6iPjWalQ&usqp=CAU',
  description:
    'Sports Fair 是一个通用的运动数据可视化仪表盘。支持跑步、跳绳、爬楼、徒步、骑行等多种运动类型，从 Keep / Apple Health / Garmin / Strava 等数据源一键同步。',
  navLinks: [
    {
      name: 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'GitHub',
      url: 'https://github.com/wuleiyuan/running-page-v2',
    },
    {
      name: 'About',
      url: 'https://github.com/wuleiyuan/running-page-v2#readme',
    },
  ],
};

export default data;
