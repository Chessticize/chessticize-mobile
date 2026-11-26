export {
  DEFAULT_LOCALE,
  LANGUAGE_NATIVE_LABELS,
  SUPPORTED_LOCALES,
  extractRegionSubtag,
  isSupportedLocale,
  matchSupportedLocale,
  normalizeLanguagePreference,
  resolveFormattingLocale,
  resolvePreferredLocale,
  selectPluralCategory,
  type LanguagePreference,
  type SupportedLocale
} from "../../../../packages/core/src/index.ts";
export {
  I18nProvider,
  useI18n,
  useTranslation,
  type I18nContextValue
} from "./I18nProvider.ts";
export {
  createTranslator,
  formatAccessibleMoveLabelForLocale,
  formatDateForLocale,
  formatLocalDateForLocale,
  formatLocalDateLabelForLocale,
  formatNumberForLocale,
  formatOrdinalForLocale,
  formatReviewDayForLocale,
  formatReviewDueLabelForLocale,
  getActiveLocale,
  getActivePreferredLanguages,
  getRegisteredCatalog,
  interpolateMessage,
  registerLocaleCatalog,
  setActiveLocale,
  setActivePreferredLanguages,
  translate,
  type TranslateFn
} from "./translate.ts";
export {
  enMessages,
  type EnMessages,
  type LocaleCatalog,
  type MessageKey
} from "./locales/en.ts";
export type { MessageValue, PluralMessage, TranslateArgs } from "./types.ts";
