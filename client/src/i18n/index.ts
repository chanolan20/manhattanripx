/**
 * Manhattan RIP X — i18n module
 * Lightweight i18n without external deps — uses stored language setting
 */
import en from "./locales/en";
import es from "./locales/es";
import fr from "./locales/fr";
import de from "./locales/de";
import pt from "./locales/pt";
import it from "./locales/it";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
type Translations = typeof en;

const locales: Record<string, Translations> = { en, es, fr, de, pt, it };

// Get current language — read from DOM meta tag set by backend, fallback to 'en'
export function getLang(): string {
  if (typeof document !== "undefined") {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="x-lang"]');
    if (meta?.content && locales[meta.content]) return meta.content;
  }
  return "en";
}

export function setLang(lang: string) {
  if (typeof document !== "undefined") {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="x-lang"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "x-lang";
      document.head.appendChild(meta);
    }
    meta.content = lang;
    document.documentElement.lang = lang;
  }
}

// Get translations for current language
export function t(): Translations {
  const lang = getLang();
  return locales[lang] || locales.en;
}

// Flat key access: t2("queue.title") → "Queue"
export function t2(key: string, replacements?: Record<string, string>): string {
  const parts = key.split(".");
  const translations = t();
  let result: any = translations;
  for (const part of parts) {
    result = result?.[part];
  }
  let str = typeof result === "string" ? result : key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

export { en, es, fr, de, pt, it };
export type { Translations };
