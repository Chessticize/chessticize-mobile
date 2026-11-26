export const SUPPORTED_LOCALES = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "es",
  "de",
  "fr",
  "pt-BR"
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LanguagePreference = "system" | SupportedLocale;

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const LANGUAGE_NATIVE_LABELS: Readonly<Record<SupportedLocale, string>> = {
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  "pt-BR": "Português (Brasil)"
};

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALE_SET.has(value);
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  if (value === "system") {
    return "system";
  }
  if (isSupportedLocale(value)) {
    return value;
  }
  if (typeof value === "string") {
    return matchSupportedLocale(value) ?? "system";
  }
  return "system";
}

export function matchSupportedLocale(tag: string | null | undefined): SupportedLocale | undefined {
  if (typeof tag !== "string") {
    return undefined;
  }
  const trimmed = tag.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const normalized = trimmed.replace(/_/g, "-");
  const subtags = normalized.split("-").filter((part) => part.length > 0);
  const language = subtags[0]?.toLowerCase();
  if (!language) {
    return undefined;
  }

  if (language === "en") {
    return "en";
  }
  if (language === "es") {
    return "es";
  }
  if (language === "de") {
    return "de";
  }
  if (language === "fr") {
    return "fr";
  }
  if (language === "pt") {
    return "pt-BR";
  }
  if (language === "ja") {
    return "ja";
  }
  if (language === "ko") {
    return "ko";
  }
  if (language === "zh") {
    const restLower = subtags.slice(1).map((part) => part.toLowerCase());
    if (restLower.includes("hant")) {
      return "zh-Hant";
    }
    if (restLower.includes("hans")) {
      return "zh-Hans";
    }
    if (restLower.includes("tw") || restLower.includes("hk") || restLower.includes("mo")) {
      return "zh-Hant";
    }
    if (restLower.length === 0 || restLower.includes("cn") || restLower.includes("sg")) {
      return "zh-Hans";
    }
    return "zh-Hans";
  }

  return undefined;
}

export function extractRegionSubtag(tag: string | null | undefined): string | undefined {
  if (typeof tag !== "string") {
    return undefined;
  }
  const normalized = tag.trim().replace(/_/g, "-");
  if (normalized.length === 0) {
    return undefined;
  }
  const subtags = normalized.split("-").filter((part) => part.length > 0);
  for (let i = 1; i < subtags.length; i += 1) {
    const part = subtags[i]!;
    if (part.length === 1) {
      // Stop before BCP 47 extension or private-use singletons (-u-, -t-, -x-).
      break;
    }
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }
    if (/^[0-9]{3}$/.test(part)) {
      return part;
    }
  }
  return undefined;
}

export function resolveFormattingLocale(
  locale: SupportedLocale,
  preferredLanguages?: readonly string[]
): string {
  const deviceRegion = preferredLanguages?.map(extractRegionSubtag).find(Boolean);
  if (deviceRegion) {
    const baseSubtags = locale.split("-");
    const last = baseSubtags[baseSubtags.length - 1];
    const withoutRegion =
      baseSubtags.length > 1 && last && (/^[A-Za-z]{2}$/.test(last) || /^[0-9]{3}$/.test(last))
        ? baseSubtags.slice(0, -1).join("-")
        : locale;
    return `${withoutRegion}-${deviceRegion}`;
  }
  return locale === "en" ? "en-US" : locale;
}

export function resolvePreferredLocale(
  preferredLanguages: readonly string[] | undefined,
  preference: LanguagePreference = "system"
): SupportedLocale {
  if (preference !== "system") {
    return preference;
  }
  if (preferredLanguages) {
    for (const tag of preferredLanguages) {
      const matched = matchSupportedLocale(tag);
      if (matched) {
        return matched;
      }
    }
  }
  return DEFAULT_LOCALE;
}

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

const pluralRulesCache = new Map<SupportedLocale, Intl.PluralRules | null>();

function getPluralRules(locale: SupportedLocale): Intl.PluralRules | null {
  if (pluralRulesCache.has(locale)) {
    return pluralRulesCache.get(locale) ?? null;
  }
  try {
    if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
      const rules = new Intl.PluralRules(locale);
      pluralRulesCache.set(locale, rules);
      return rules;
    }
  } catch {
    // Fall back to deterministic rules below.
  }
  pluralRulesCache.set(locale, null);
  return null;
}

export function selectPluralCategory(count: number, locale: SupportedLocale): PluralCategory {
  const rules = getPluralRules(locale);
  if (rules) {
    return rules.select(count) as PluralCategory;
  }
  if (locale === "zh-Hans" || locale === "zh-Hant" || locale === "ja" || locale === "ko") {
    return "other";
  }
  if (locale === "fr") {
    return count === 0 || count === 1 ? "one" : "other";
  }
  return count === 1 ? "one" : "other";
}

export function formatLocalizedNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
      return new Intl.NumberFormat(locale, options).format(value);
    }
  } catch {
    // Fall back to plain string conversion.
  }
  return String(value);
}

export function formatLocalizedDate(
  date: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      return new Intl.DateTimeFormat(locale, options).format(date);
    }
  } catch {
    // Fall back to ISO date string.
  }
  return date.toISOString();
}
