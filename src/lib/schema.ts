// Билдеры JSON-LD. Один файл — все типы schema.org, которые мы вставляем на сайт.
// Возвращают plain-объекты; рендерить через <script type="application/ld+json">.

import { business } from '../data/business';

type JsonLd = Record<string, unknown>;

const SITE = business.url;

// ---------- Базовые сущности (ссылаемся через @id, чтобы не дублировать) ----------

const ORG_ID = `${SITE}/#organization`;
const WEBSITE_ID = `${SITE}/#website`;

export function organization(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: business.name,
    legalName: business.legalName,
    alternateName: business.alternateName,
    url: SITE,
    logo: {
      '@type': 'ImageObject',
      url: new URL(business.logoSvgUrl, SITE).href,
      contentUrl: new URL(business.logoSvgUrl, SITE).href,
    },
    description: business.description,
    areaServed: business.areaServed,
    sameAs: business.sameAs,
    ...(business.telegram && { contactPoint: [telegramContact(), ...(business.phone ? [phoneContact()] : [])] }),
  };
}

export function localBusiness(): JsonLd {
  return {
    '@type': ['LocalBusiness', 'AdvertisingAgency'],
    '@id': `${SITE}/#localbusiness`,
    name: business.name,
    url: SITE,
    description: business.description,
    image: new URL(business.ogImageUrl, SITE).href,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressCountry: business.address.country,
      addressRegion: business.address.regionName,
      addressLocality: business.address.locality,
      ...(business.address.postalCode && { postalCode: business.address.postalCode }),
      ...(business.address.streetAddress && { streetAddress: business.address.streetAddress }),
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: business.geo.latitude,
      longitude: business.geo.longitude,
    },
    openingHoursSpecification: parseOpeningHours(business.openingHours),
    sameAs: business.sameAs,
    ...(business.phone && { telephone: business.phone }),
    ...(business.email && { email: business.email }),
    parentOrganization: { '@id': ORG_ID },
  };
}

function telegramContact(): JsonLd {
  return {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    url: business.telegram,
    availableLanguage: ['ru', 'uz', 'en'],
  };
}

function phoneContact(): JsonLd {
  return {
    '@type': 'ContactPoint',
    contactType: 'sales',
    telephone: business.phone,
    availableLanguage: ['ru', 'uz'],
  };
}

// «Mo-Fr 09:00-18:00» → OpeningHoursSpecification
function parseOpeningHours(spec: string): JsonLd[] {
  const dayMap: Record<string, string> = {
    Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday',
    Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday',
  };
  const match = /^([A-Z][a-z])-([A-Z][a-z])\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(spec);
  if (!match) return [];
  const [, from, to, h1, m1, h2, m2] = match;
  const order = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const start = order.indexOf(from!);
  const end = order.indexOf(to!);
  const days = order.slice(start, end + 1).map((d) => dayMap[d]!);
  return [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: days,
    opens: `${h1}:${m1}`,
    closes: `${h2}:${m2}`,
  }];
}

// ---------- WebSite + SearchAction (главная) ----------

export function website(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE,
    name: business.name,
    description: business.description,
    publisher: { '@id': ORG_ID },
    inLanguage: 'ru-UZ',
    // SearchAction: Google может показать поле поиска в SERP.
    // У нас пока нет поиска по сайту — закомментировано. Включим, когда добавим.
    // potentialAction: {
    //   '@type': 'SearchAction',
    //   target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/search?q={search_term_string}` },
    //   'query-input': 'required name=search_term_string',
    // },
  };
}

// ---------- BreadcrumbList ----------

export type Crumb = { name: string; url: string };

export function breadcrumbs(items: Crumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.url, SITE).href,
    })),
  };
}

// ---------- Service (страницы услуг) ----------

export type ServiceInput = {
  name: string;
  description: string;
  url: string;
  serviceType?: string | string[];
  providerMobility?: 'static' | 'dynamic';
};

export function service(input: ServiceInput): JsonLd {
  return {
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: new URL(input.url, SITE).href,
    provider: { '@id': ORG_ID },
    areaServed: business.areaServed.map((a) => ({ '@type': 'AdministrativeArea', name: a })),
    ...(input.serviceType && { serviceType: input.serviceType }),
  };
}

// ---------- FAQPage ----------

export type FaqItem = { q: string; a: string };

export function faqPage(items: FaqItem[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

// ---------- Article / NewsArticle (для блога — этап 5) ----------

export type ArticleInput = {
  headline: string;
  description: string;
  url: string;
  image: string;
  datePublished: string; // ISO
  dateModified?: string;
  authorName?: string;
  authorUrl?: string;
};

export function article(input: ArticleInput): JsonLd {
  return {
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    url: new URL(input.url, SITE).href,
    image: new URL(input.image, SITE).href,
    datePublished: input.datePublished,
    ...(input.dateModified && { dateModified: input.dateModified }),
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName, ...(input.authorUrl && { url: input.authorUrl }) }
      : { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    mainEntityOfPage: new URL(input.url, SITE).href,
  };
}

// ---------- WebApplication / SoftwareApplication (инструменты /tools/*) ----------

export type WebApplicationInput = {
  name: string;
  description: string;
  url: string;
  // Главный тип. BrowserApplication подойдёт для онлайн-утилит без установки.
  applicationCategory?: string;
  featureList?: string[];
  // Пример: 'Any' — работает в любом современном браузере.
  operatingSystem?: string;
};

export function webApplication(input: WebApplicationInput): JsonLd {
  const absoluteUrl = new URL(input.url, SITE).href;
  return {
    '@type': ['WebApplication', 'SoftwareApplication'],
    name: input.name,
    description: input.description,
    url: absoluteUrl,
    applicationCategory: input.applicationCategory ?? 'BusinessApplication',
    operatingSystem: input.operatingSystem ?? 'Any',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    inLanguage: 'ru',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@id': ORG_ID },
    ...(input.featureList && { featureList: input.featureList }),
  };
}

// ---------- WebPage (универсальная обёртка) ----------

export type WebPageInput = {
  title: string;
  description: string;
  url: string;
  breadcrumbs?: Crumb[];
};

export function webPage(input: WebPageInput): JsonLd {
  const base: JsonLd = {
    '@type': 'WebPage',
    name: input.title,
    description: input.description,
    url: new URL(input.url, SITE).href,
    inLanguage: 'ru-UZ',
    isPartOf: { '@id': WEBSITE_ID },
  };
  if (input.breadcrumbs && input.breadcrumbs.length > 0) {
    base.breadcrumb = breadcrumbs(input.breadcrumbs);
  }
  return base;
}

// ---------- Хелперы для [...page].astro ----------

// Собрать хлебные крошки по URL: / → /services/ → /tv/
// Для /platforms/[slug]/ и /cases/[slug]/ — отдельная логика в своих роутах.
export function breadcrumbsFromUrl(url: string, title: string): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Главная', url: '/' }];
  const path = url.replace(/^\/+|\/+$/g, '');
  if (!path) return crumbs;
  // Для одноуровневой страницы — одна крошка «Главная → Текущая»
  crumbs.push({ name: title, url: `/${path}/` });
  return crumbs;
}

// Схемы услуг: ключ страницы (slug) → serviceType для schema.org
const SERVICE_TYPES: Record<string, string | string[]> = {
  tv: 'Television advertising',
  radio: 'Radio advertising',
  outdoor: 'Outdoor advertising',
  search: ['Search engine marketing', 'Google Ads', 'Yandex Direct'],
  social: ['Social media advertising', 'Instagram Ads', 'Facebook Ads', 'Meta Ads'],
  media: ['Telegram advertising', 'Native advertising', 'Public relations'],
  bloggers: 'Influencer marketing',
  creative: 'Creative production',
  sites: 'Website development',
  topup: 'Advertising account funding',
  channels: ['Display advertising', 'Programmatic advertising'],
  services: 'Advertising services',
};

export function serviceTypeFor(slug: string): string | string[] | undefined {
  return SERVICE_TYPES[slug];
}

// ---------- Обёртка в @graph ----------

export function graph(nodes: JsonLd[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}
