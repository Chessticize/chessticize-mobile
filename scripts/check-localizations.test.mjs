import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkLocalizations,
  extractPlaceholders,
  validateCatalogs
} from "./check-localizations.mjs";
import { buildLocalizationReport } from "./build-localization-report.mjs";

test("repository localization check passes across all 9 locales, glossary, and native configs", async () => {
  const result = await checkLocalizations();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.localeCount, 9);
  assert.ok(result.keyCount > 400);
  assert.ok(result.glossaryTermCount >= 15);
});

test("validateCatalogs detects missing keys, placeholder drift, and glossary drift", () => {
  const base = {
    "tabs.practice": "Practice",
    "common.ratingValue": "Rating {{rating}}",
    "common.puzzlesCount": { one: "{{count}} puzzle", other: "{{count}} puzzles" }
  };

  const errors = validateCatalogs({
    supportedLocales: ["en", "ja"],
    catalogs: {
      en: base,
      ja: {
        "tabs.practice": "トレーニング",
        "common.ratingValue": "レート {{elo}}",
        "common.puzzlesCount": { other: "{{count}} 問" },
        "extra.unused": "extra"
      }
    },
    glossary: {
      terms: [
        {
          id: "tab-practice",
          key: "tabs.practice",
          translations: { en: "Practice", ja: "練習" }
        }
      ]
    }
  });

  assert.ok(errors.some((e) => e.includes('Extra key "extra.unused"')));
  assert.ok(errors.some((e) => e.includes('Key "common.ratingValue" placeholder mismatch')));
  assert.ok(errors.some((e) => e.includes('Drift for "tab-practice"')));
  assert.deepEqual(extractPlaceholders("{{b}} and {{a}} and {{a}}"), ["{{a}}", "{{b}}"]);
});

test("buildLocalizationReport generates HTML, Markdown, and JSON review artifacts", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chessticize-i18n-report-"));
  try {
    const result = await buildLocalizationReport({
      outputDir: tmpDir,
      languages: ["ja", "zh-Hant", "ko"],
      allLanguages: false
    });
    assert.deepEqual(result.targetLocales, ["ja", "zh-Hant", "ko"]);
    assert.ok(result.keyCount > 400);
    assert.equal(existsSync(result.htmlPath), true);
    assert.equal(existsSync(result.mdPath), true);
    assert.equal(existsSync(result.jsonPath), true);

    const html = readFileSync(result.htmlPath, "utf8");
    const md = readFileSync(result.mdPath, "utf8");
    const json = JSON.parse(readFileSync(result.jsonPath, "utf8"));

    assert.ok(html.includes("アローデュエル"));
    assert.ok(html.includes("箭頭對決"));
    assert.ok(html.includes("화살표 대결"));
    assert.ok(md.includes("| `tabs.practice` | Practice | 練習 | 練習 | 연습 |"));
    assert.equal(json.rows.length, result.keyCount);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
