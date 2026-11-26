import React, { createContext, useContext, useEffect, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  resolvePreferredLocale,
  type LanguagePreference,
  type SupportedLocale
} from "../../../../packages/core/src/index.ts";
import { readDevicePreferredLanguages } from "../platform/deviceLocale.ts";
import {
  createTranslator,
  formatDateForLocale,
  formatNumberForLocale,
  setActiveLocale,
  setActivePreferredLanguages,
  type TranslateFn
} from "./translate.ts";

export type I18nContextValue = {
  locale: SupportedLocale;
  languagePreference: LanguagePreference;
  preferredLanguages: readonly string[];
  setLanguagePreference: (language: LanguagePreference) => void;
  t: TranslateFn;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
};

const defaultTranslate = createTranslator(DEFAULT_LOCALE);

const DEFAULT_CONTEXT: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  languagePreference: "system",
  preferredLanguages: [DEFAULT_LOCALE],
  setLanguagePreference: () => undefined,
  t: defaultTranslate,
  formatNumber: (value, options) => formatNumberForLocale(value, DEFAULT_LOCALE, options),
  formatDate: (date, options) => formatDateForLocale(date, DEFAULT_LOCALE, options)
};

// Defaults to English so components render identically in standalone unit/component tests.
const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

// Written without JSX so root `tsc --noEmit` can include this module, matching ThemeProvider.ts.
export function I18nProvider({
  children,
  languagePreference = "system",
  locale,
  onLanguagePreferenceChange,
  preferredLanguages
}: React.PropsWithChildren<{
  languagePreference?: LanguagePreference;
  locale?: SupportedLocale;
  onLanguagePreferenceChange?: (language: LanguagePreference) => void;
  preferredLanguages?: readonly string[];
}>): React.JSX.Element {
  const effectivePreferred = useMemo(
    () => preferredLanguages ?? readDevicePreferredLanguages(),
    [preferredLanguages]
  );
  const resolvedLocale = locale ?? resolvePreferredLocale(effectivePreferred, languagePreference);

  // Sync synchronously during render so non-React presentation helpers called in render see the resolved locale and device region immediately.
  setActiveLocale(resolvedLocale);
  setActivePreferredLanguages(effectivePreferred);
  useEffect(() => {
    setActiveLocale(resolvedLocale);
    setActivePreferredLanguages(effectivePreferred);
  }, [effectivePreferred, resolvedLocale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale: resolvedLocale,
    languagePreference,
    preferredLanguages: effectivePreferred,
    setLanguagePreference: onLanguagePreferenceChange ?? (() => undefined),
    t: createTranslator(resolvedLocale),
    formatNumber: (num, options) => formatNumberForLocale(num, resolvedLocale, options, effectivePreferred),
    formatDate: (date, options) => formatDateForLocale(date, resolvedLocale, options, effectivePreferred)
  }), [effectivePreferred, languagePreference, onLanguagePreferenceChange, resolvedLocale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useTranslation(): { locale: SupportedLocale; t: TranslateFn } {
  const { locale, t } = useContext(I18nContext);
  return { locale, t };
}
