// Кадры для блоков «Примеры размещения»: из медиакитов площадок (format-shots.json)
// и собственные примеры услуг (service-shots.json, кадры в public/formats/services/).
import kit from './format-shots.json';
import own from './service-shots.json';
import type { Shot } from './pages';

const all: Shot[] = [...kit, ...own];

export function shot(src: string): Shot {
  const s = all.find((x) => x.src === src);
  if (!s) throw new Error(`Нет кадра ${src}`);
  return { src: s.src, w: s.w, h: s.h, bg: s.bg };
}
