import type { Locale } from './types';

export interface I18nStrings {
  [key: string]: string | I18nStrings;
}

export interface I18nModule {
  locale: Locale;
  strings: I18nStrings;
}

export interface DetectLocaleOptions {
  default?: Locale;
  supported?: Locale[];
}

export function detectLocaleFromNavigator(
  options: DetectLocaleOptions = {}
): Locale {
  const { default: defaultLocale = 'en', supported = ['en', 'es'] } = options;

  if (typeof navigator === 'undefined') return defaultLocale;

  const languages = navigator.languages || [navigator.language || ''];

  for (const lang of languages) {
    const base = lang.split('-')[0].toLowerCase();
    if (supported.includes(base as Locale)) {
      return base as Locale;
    }
  }

  return defaultLocale;
}

export function getLocaleFromURL(): Locale | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');

  if (lang === 'en' || lang === 'es') {
    return lang;
  }

  return null;
}

export function getStoredLocale(): Locale | null {
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem('locale');
  if (stored === 'en' || stored === 'es') {
    return stored;
  }

  return null;
}

export function setStoredLocale(locale: Locale): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', locale);
  }
}

export function selectLocale(options: DetectLocaleOptions = {}): Locale {
  const urlLocale = getLocaleFromURL();
  if (urlLocale) return urlLocale;

  const storedLocale = getStoredLocale();
  if (storedLocale) return storedLocale;

  return detectLocaleFromNavigator(options);
}
