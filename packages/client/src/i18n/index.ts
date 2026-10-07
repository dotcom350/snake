import type { Locale } from '@snake/shared';
import {
  detectLocaleFromNavigator,
  getLocaleFromURL,
  getStoredLocale,
  setStoredLocale,
} from '@snake/shared';
import { en } from './en';
import { es } from './es';

type I18nStrings = typeof en;
type NestedKeys<T> = T extends Record<string, infer U>
  ? U extends Record<string, infer V>
    ? `${Extract<keyof T, string>}.${Extract<keyof U, string>}`
    : never
  : never;

const translations: Record<Locale, I18nStrings> = {
  en,
  es,
};

export class I18n {
  private locale: Locale = 'en';
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.locale = this.selectLocale();
  }

  private selectLocale(): Locale {
    const urlLocale = getLocaleFromURL();
    if (urlLocale) {
      this.setLocale(urlLocale);
      return urlLocale;
    }

    const storedLocale = getStoredLocale();
    if (storedLocale) {
      this.locale = storedLocale;
      return storedLocale;
    }

    const detected = detectLocaleFromNavigator({ default: 'en' });
    this.locale = detected;
    return detected;
  }

  getLocale(): Locale {
    return this.locale;
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    setStoredLocale(locale);
    document.documentElement.lang = locale;
    this.notifyListeners();
  }

  t(key: NestedKeys<I18nStrings>, params?: Record<string, string | number>): string {
    const [section, ...parts] = key.split('.');
    const sectionName = section as keyof I18nStrings;
    let value: any = translations[this.locale][sectionName];

    for (const part of parts) {
      value = value?.[part];
    }

    if (!value) {
      return key; // Fallback to key if not found
    }

    if (params) {
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        value as string
      );
    }

    return value as string;
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb());
  }
}

export const i18n = new I18n();
