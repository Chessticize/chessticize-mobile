import {
  DEFAULT_LOCALE,
  formatLocalCalendarDate,
  formatLocalCalendarDateLabel,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatReviewDay,
  resolveFormattingLocale,
  reviewDueLabel,
  selectPluralCategory,
  type AccessibleMoveLabelInput,
  type ReviewQueueState,
  type SupportedLocale
} from "../../../../packages/core/src/index.ts";
import { deMessages } from "./locales/de.ts";
import { enMessages, type EnMessages, type LocaleCatalog, type MessageKey } from "./locales/en.ts";
import { esMessages } from "./locales/es.ts";
import { frMessages } from "./locales/fr.ts";
import { jaMessages } from "./locales/ja.ts";
import { koMessages } from "./locales/ko.ts";
import { ptBRMessages } from "./locales/pt-BR.ts";
import { zhHansMessages } from "./locales/zh-Hans.ts";
import { zhHantMessages } from "./locales/zh-Hant.ts";
import type { MessageValue, TranslateArgs } from "./types.ts";

const REGISTERED_CATALOGS: Record<SupportedLocale, LocaleCatalog> = {
  en: enMessages,
  "zh-Hans": zhHansMessages,
  "zh-Hant": zhHantMessages,
  ja: jaMessages,
  ko: koMessages,
  es: esMessages,
  de: deMessages,
  fr: frMessages,
  "pt-BR": ptBRMessages
};

let activeLocale: SupportedLocale = DEFAULT_LOCALE;
let activePreferredLanguages: readonly string[] = [DEFAULT_LOCALE];

export function getActiveLocale(): SupportedLocale {
  return activeLocale;
}

export function setActiveLocale(locale: SupportedLocale): void {
  activeLocale = locale;
}

export function getActivePreferredLanguages(): readonly string[] {
  return activePreferredLanguages;
}

export function setActivePreferredLanguages(preferredLanguages: readonly string[]): void {
  activePreferredLanguages = preferredLanguages;
}

export function registerLocaleCatalog(locale: SupportedLocale, catalog: LocaleCatalog): void {
  REGISTERED_CATALOGS[locale] = catalog;
}

export function getRegisteredCatalog(locale: SupportedLocale): LocaleCatalog {
  return REGISTERED_CATALOGS[locale] ?? enMessages;
}

export function interpolateMessage(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

function selectMessageTemplate(
  value: MessageValue,
  locale: SupportedLocale,
  params?: Record<string, string | number>
): string {
  if (typeof value === "string") {
    return value;
  }
  const rawCount = params?.count;
  const count = typeof rawCount === "number" ? rawCount : Number(rawCount ?? 0);
  const category = selectPluralCategory(count, locale);
  if (category === "one" && value.one !== undefined) {
    return value.one;
  }
  return value.other;
}

export function translate<K extends MessageKey>(
  locale: SupportedLocale,
  key: K,
  ...args: TranslateArgs<EnMessages[K]>
): string {
  const catalog = getRegisteredCatalog(locale);
  const value: MessageValue = catalog[key] ?? enMessages[key];
  const params = args[0] as Record<string, string | number> | undefined;
  const template = selectMessageTemplate(value, locale, params);
  return interpolateMessage(template, params);
}

export type TranslateFn = <K extends MessageKey>(
  key: K,
  ...args: TranslateArgs<EnMessages[K]>
) => string;

export function createTranslator(locale: SupportedLocale): TranslateFn {
  return (key, ...args) => translate(locale, key, ...args);
}

export function formatNumberForLocale(
  value: number,
  locale: SupportedLocale = activeLocale,
  options?: Intl.NumberFormatOptions,
  preferredLanguages: readonly string[] = activePreferredLanguages
): string {
  return formatLocalizedNumber(value, intlLocaleTag(locale, preferredLanguages), options);
}

export function formatDateForLocale(
  date: Date,
  locale: SupportedLocale = activeLocale,
  options?: Intl.DateTimeFormatOptions,
  preferredLanguages: readonly string[] = activePreferredLanguages
): string {
  return formatLocalizedDate(date, intlLocaleTag(locale, preferredLanguages), options);
}

function intlLocaleTag(
  locale: SupportedLocale,
  preferredLanguages: readonly string[] = activePreferredLanguages
): string {
  return resolveFormattingLocale(locale, preferredLanguages);
}

export function formatLocalDateForLocale(
  value: string | number | Date,
  locale: SupportedLocale = activeLocale,
  timeZone?: string
): string {
  return formatLocalCalendarDate(value, {
    locale: intlLocaleTag(locale),
    ...(timeZone ? { timeZone } : {})
  });
}

export function formatLocalDateLabelForLocale(
  value: string | number | Date,
  now: string | number | Date,
  locale: SupportedLocale = activeLocale,
  timeZone?: string
): string {
  return formatLocalCalendarDateLabel(value, {
    now,
    locale: intlLocaleTag(locale),
    ...(timeZone ? { timeZone } : {}),
    labels: {
      scheduled: translate(locale, "common.scheduled"),
      today: translate(locale, "common.today"),
      yesterday: translate(locale, "common.yesterday")
    }
  });
}

export function formatReviewDayForLocale(
  reviewDay: string,
  locale: SupportedLocale = activeLocale
): string {
  return formatReviewDay(reviewDay, { locale: intlLocaleTag(locale) });
}

export function formatReviewDueLabelForLocale(
  review: Pick<ReviewQueueState, "dueDay">,
  now: string | number | Date,
  locale: SupportedLocale = activeLocale,
  timeZone?: string
): string {
  return reviewDueLabel(review, now, timeZone, intlLocaleTag(locale), {
    dueToday: translate(locale, "review.dueToday"),
    dueTomorrow: translate(locale, "review.dueTomorrow"),
    dueOn: (date) => translate(locale, "review.dueOn", { date })
  });
}

const ORDINAL_KEYS: Readonly<Record<number, MessageKey>> = {
  1: "common.ordinal.1",
  2: "common.ordinal.2",
  3: "common.ordinal.3",
  4: "common.ordinal.4",
  5: "common.ordinal.5",
  6: "common.ordinal.6",
  7: "common.ordinal.7",
  8: "common.ordinal.8",
  9: "common.ordinal.9",
  10: "common.ordinal.10"
};

export function formatOrdinalForLocale(
  value: number,
  locale: SupportedLocale = activeLocale
): string {
  const key = ORDINAL_KEYS[value];
  if (key) {
    return translate(locale, key as "common.ordinal.1");
  }
  if (locale === "en") {
    const modulo100 = value % 100;
    const suffix = modulo100 >= 11 && modulo100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
    return `${value}${suffix}`;
  }
  return translate(locale, "common.ordinal", { position: value });
}

const PIECE_KEYS: Readonly<Record<string, MessageKey>> = {
  k: "chess.piece.king",
  q: "chess.piece.queen",
  r: "chess.piece.rook",
  b: "chess.piece.bishop",
  n: "chess.piece.knight",
  p: "chess.piece.pawn"
};

export function formatAccessibleMoveLabelForLocale(
  move: AccessibleMoveLabelInput,
  locale: SupportedLocale = activeLocale
): string {
  if (move.promotion) {
    const pieceKey = PIECE_KEYS[move.promotion];
    const piece = pieceKey ? translate(locale, pieceKey as "chess.piece.queen") : move.promotion;
    return translate(locale, "chess.accessibleMovePromotion", {
      san: move.san,
      from: move.from,
      to: move.to,
      piece
    });
  }
  return translate(locale, "chess.accessibleMove", {
    san: move.san,
    from: move.from,
    to: move.to
  });
}
