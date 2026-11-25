import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  LANGUAGE_NATIVE_LABELS,
  SUPPORTED_LOCALES,
  buildAccessibleMoveOptions,
  computeNextReminder,
  formatLocalizedDate,
  formatLocalizedNumber,
  isSupportedLocale,
  matchSupportedLocale,
  normalizeLanguagePreference,
  resolvePreferredLocale,
  selectPluralCategory,
  SERVER_CURATED_THEME_GROUPS
} from "../src/index.ts";

test("matchSupportedLocale resolves regional variants and falls back cleanly", () => {
  assert.equal(matchSupportedLocale("en"), "en");
  assert.equal(matchSupportedLocale("en-US"), "en");
  assert.equal(matchSupportedLocale("en_GB"), "en");
  assert.equal(matchSupportedLocale("zh-Hans"), "zh-Hans");
  assert.equal(matchSupportedLocale("zh-Hans-CN"), "zh-Hans");
  assert.equal(matchSupportedLocale("zh_CN"), "zh-Hans");
  assert.equal(matchSupportedLocale("zh-SG"), "zh-Hans");
  assert.equal(matchSupportedLocale("zh"), "zh-Hans");
  assert.equal(matchSupportedLocale("zh-Hant"), undefined);
  assert.equal(matchSupportedLocale("zh-Hant-TW"), undefined);
  assert.equal(matchSupportedLocale("zh-TW"), undefined);
  assert.equal(matchSupportedLocale("zh-HK"), undefined);
  assert.equal(matchSupportedLocale("es"), "es");
  assert.equal(matchSupportedLocale("es-419"), "es");
  assert.equal(matchSupportedLocale("es-MX"), "es");
  assert.equal(matchSupportedLocale("de"), "de");
  assert.equal(matchSupportedLocale("de-AT"), "de");
  assert.equal(matchSupportedLocale("de-CH"), "de");
  assert.equal(matchSupportedLocale("fr"), "fr");
  assert.equal(matchSupportedLocale("fr-CA"), "fr");
  assert.equal(matchSupportedLocale("pt-BR"), "pt-BR");
  assert.equal(matchSupportedLocale("pt"), "pt-BR");
  assert.equal(matchSupportedLocale("pt-PT"), "pt-BR");
  assert.equal(matchSupportedLocale("ja-JP"), undefined);
  assert.equal(matchSupportedLocale(""), undefined);
  assert.equal(matchSupportedLocale(undefined), undefined);
});

test("resolvePreferredLocale respects explicit override over OS language list", () => {
  assert.equal(resolvePreferredLocale(["de-DE", "en-US"], "system"), "de");
  assert.equal(resolvePreferredLocale(["ja-JP", "fr-FR", "en-US"], "system"), "fr");
  assert.equal(resolvePreferredLocale(["zh-Hant-TW", "es-ES"], "system"), "es");
  assert.equal(resolvePreferredLocale(["ja-JP", "ko-KR"], "system"), DEFAULT_LOCALE);
  assert.equal(resolvePreferredLocale([], "system"), DEFAULT_LOCALE);
  assert.equal(resolvePreferredLocale(undefined, "system"), DEFAULT_LOCALE);
  assert.equal(resolvePreferredLocale(["de-DE"], "pt-BR"), "pt-BR");
  assert.equal(resolvePreferredLocale(["zh-Hans-CN"], "en"), "en");
});

test("supported locales and native labels are complete", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(isSupportedLocale(locale), true);
    assert.ok(LANGUAGE_NATIVE_LABELS[locale].length > 0);
  }
  assert.equal(isSupportedLocale("ja"), false);
  assert.equal(normalizeLanguagePreference("system"), "system");
  assert.equal(normalizeLanguagePreference("de"), "de");
  assert.equal(normalizeLanguagePreference("es-MX"), "es");
  assert.equal(normalizeLanguagePreference("ja"), "system");
  assert.equal(normalizeLanguagePreference(null), "system");
});

test("selectPluralCategory follows locale plural rules", () => {
  assert.equal(selectPluralCategory(1, "en"), "one");
  assert.equal(selectPluralCategory(0, "en"), "other");
  assert.equal(selectPluralCategory(2, "en"), "other");
  assert.equal(selectPluralCategory(0, "fr"), "one");
  assert.equal(selectPluralCategory(1, "fr"), "one");
  assert.equal(selectPluralCategory(2, "fr"), "other");
  assert.equal(selectPluralCategory(1, "zh-Hans"), "other");
  assert.equal(selectPluralCategory(5, "zh-Hans"), "other");
  assert.equal(selectPluralCategory(1, "de"), "one");
  assert.equal(selectPluralCategory(2, "de"), "other");
});

test("localized number and date formatters produce non-empty locale-aware strings", () => {
  assert.ok(formatLocalizedNumber(1234, "en").includes("1"));
  assert.ok(formatLocalizedNumber(1234, "de").includes("1"));
  const date = new Date("2026-07-18T18:00:00.000Z");
  assert.ok(formatLocalizedDate(date, "en", { month: "short", day: "numeric" }).length > 0);
  assert.ok(formatLocalizedDate(date, "zh-Hans", { month: "short", day: "numeric" }).length > 0);
});

test("core decoupling hooks allow localized reminder body, accessible moves, and theme group ids", () => {
  const decision = computeNextReminder(
    [{ dueDay: "2026-07-18" }, { dueDay: "2026-07-18" }],
    [],
    { kind: "fixed", hour: 19, minute: 0 },
    "2026-07-18T12:00:00.000Z",
    { formatBody: (dueCount) => `Bereit: ${dueCount}` }
  );
  assert.equal(decision?.body, "Bereit: 2");

  const moves = buildAccessibleMoveOptions("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", {
    formatLabel: ({ san, from, to, promotion }) => `${san} (${from}->${to}${promotion ? `=${promotion}` : ""})`
  });
  assert.ok(moves.some((move) => move.san === "a8=Q+" && move.label === "a8=Q+ (a7->a8=q)"));

  assert.deepEqual(
    SERVER_CURATED_THEME_GROUPS.map((group) => group.id),
    ["checkmates", "piece_tactics", "forcing_motifs", "pawns_and_endings"]
  );
});
