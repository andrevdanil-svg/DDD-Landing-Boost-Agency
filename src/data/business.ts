// Данные компании для schema.org (Organization, LocalBusiness) и meta-тегов.
// Юр.данные (ИНН, юр.адрес, координаты) — TODO: пользователь пришлёт.
// Пока — публичные данные с сайта и Telegram.

export const business = {
  // Базовое
  name: 'Boost! Agency',
  legalName: 'Boost! Agency', // TODO: ООО/ЧП — заменить на юр.наименование
  alternateName: 'Boost Agency',
  tagline: 'Рекламное агентство в Ташкенте',
  description:
    'Рекламное агентство в Ташкенте с 2019 года: реклама в интернете, на ТВ, радио и улицах, сайты под трафик и пополнение рекламных кабинетов. Работаем с 21 рекламной площадкой Узбекистана.',
  foundingYear: 2019,
  url: 'https://boostagency.uz',

  // Контакты
  telegram: 'https://t.me/v1lats',
  email: '', // TODO
  phone: '', // TODO: +998 ...

  // Адрес и гео (LocalBusiness)
  address: {
    country: 'UZ',
    countryName: 'Узбекистан',
    region: 'UZ-TK',
    regionName: 'Ташкент',
    locality: 'Ташкент',
    postalCode: '', // TODO
    streetAddress: '', // TODO
  },
  geo: {
    // TODO: уточнить координаты офиса
    latitude: 41.311081, // Ташкент, центр — временно
    longitude: 69.240562,
  },
  openingHours: 'Mo-Fr 09:00-18:00',

  // Соцсети и ссылки (sameAs)
  sameAs: [
    'https://t.me/v1lats',
    // TODO: Instagram, LinkedIn, Facebook, YouTube — добавить, когда будут
  ],

  // Что продаём (areaServed, serviceType — для Service schema)
  areaServed: ['Узбекистан', 'Ташкент', 'Самарканд', 'Бухара', 'Андижан', 'Фергана', 'Наманган', 'Нукус'],

  // OG. Google принимает SVG в Organization.logo; PNG держим в запасе на случай
  // клиентов, которые требуют растр (Facebook OG — отдельно, через ogImageUrl).
  logoUrl: '/brand/logo_boost_light.svg',
  logoSvgUrl: '/brand/logo_boost_mark.svg',
  ogImageUrl: '/brand/og-image.png',

  // Верификации поисковиков — строка из `content="..."` их мета-тега.
  verification: {
    google: 'Ur-JVqzRdqG2EACSu3Cly0KxlbrXcMT-XfgVSTlYFs0', // https://search.google.com/search-console
    yandex: 'a9b104d9bf984e15', // https://webmaster.yandex.com
  },
} as const;

export type Business = typeof business;
