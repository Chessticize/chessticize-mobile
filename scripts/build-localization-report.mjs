#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepositoryLocalizationData } from "./check-localizations.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function formatEntry(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && typeof entry === "object") {
    const parts = [];
    if (entry.one !== undefined) {
      parts.push(`one: ${entry.one}`);
    }
    parts.push(`other: ${entry.other}`);
    return parts.join(" | ");
  }
  return "";
}

export function parseReportArgs(argv) {
  const options = {
    allLanguages: false,
    languages: [],
    outputDir: path.join(DEFAULT_REPO_ROOT, "scratch", "localization-report")
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all-languages") {
      options.allLanguages = true;
    } else if (arg === "--language" || arg === "-l") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${arg} requires a locale tag.`);
      }
      options.languages.push(value);
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${arg} requires an output directory.`);
      }
      options.outputDir = path.resolve(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function buildLocalizationReport({
  repoRoot = DEFAULT_REPO_ROOT,
  outputDir = path.join(repoRoot, "scratch", "localization-report"),
  languages = [],
  allLanguages = true
} = {}) {
  const { supportedLocales, nativeLabels, catalogs } = await loadRepositoryLocalizationData(repoRoot);
  const nonEnglish = supportedLocales.filter((locale) => locale !== "en");
  const targetLocales =
    !allLanguages && languages.length > 0
      ? languages.filter((locale) => locale !== "en")
      : nonEnglish;

  for (const locale of targetLocales) {
    if (!supportedLocales.includes(locale)) {
      throw new Error(`Unsupported locale "${locale}". Supported: ${supportedLocales.join(", ")}`);
    }
  }

  const keys = Object.keys(catalogs.en);
  const rows = keys.map((key) => {
    const section = key.split(".")[0] ?? "other";
    const translations = { en: formatEntry(catalogs.en[key]) };
    for (const locale of targetLocales) {
      translations[locale] = formatEntry(catalogs[locale][key]);
    }
    return { key, section, translations };
  });

  mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, "localization-review.json");
  const mdPath = path.join(outputDir, "localization-review.md");
  const htmlPath = path.join(outputDir, "localization-review.html");

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceLocale: "en",
    targetLocales,
    keyCount: rows.length,
    rows
  };
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const headerCols = ["Key", "en", ...targetLocales];
  const mdLines = [
    "# Chessticize Localization Review",
    "",
    `- Keys: ${rows.length}`,
    `- Locales: en, ${targetLocales.join(", ")}`,
    "",
    `| ${headerCols.join(" | ")} |`,
    `| ${headerCols.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| \`${escapeMarkdownCell(row.key)}\` | ${["en", ...targetLocales]
          .map((loc) => escapeMarkdownCell(row.translations[loc]))
          .join(" | ")} |`
    )
  ];
  writeFileSync(mdPath, `${mdLines.join("\n")}\n`, "utf8");

  const sections = [...new Set(rows.map((row) => row.section))].sort();
  const tableHeaderCells = ["en", ...targetLocales]
    .map((loc) => `<th data-col="${escapeHtml(loc)}">${escapeHtml(loc)} (${escapeHtml(nativeLabels[loc] ?? loc)})</th>`)
    .join("");
  const tableBodyRows = rows
    .map((row) => {
      const cells = ["en", ...targetLocales]
        .map((loc) => `<td data-col="${escapeHtml(loc)}">${escapeHtml(row.translations[loc])}</td>`)
        .join("");
      return `<tr data-section="${escapeHtml(row.section)}" data-search="${escapeHtml(`${row.key} ${Object.values(row.translations).join(" ")}`.toLowerCase())}"><td class="key"><code>${escapeHtml(row.key)}</code></td>${cells}</tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Chessticize Localization Review (${rows.length} keys)</title>
<style>
  :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { margin: 0; padding: 16px 20px; background: Canvas; color: CanvasText; }
  header { position: sticky; top: 0; background: Canvas; padding: 8px 0 12px; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); z-index: 2; }
  h1 { margin: 0 0 8px; font-size: 1.25rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  input[type="search"], select { padding: 6px 10px; font-size: 14px; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); background: Field; color: FieldText; }
  .meta { font-size: 13px; opacity: 0.75; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
  th { position: sticky; top: 94px; background: Canvas; font-weight: 600; }
  td.key code { font-size: 12px; white-space: nowrap; }
  tr.hidden { display: none; }
</style>
</head>
<body>
<header>
  <h1>Chessticize Localization Review</h1>
  <div class="controls">
    <input id="q" type="search" placeholder="Filter by key or translation..." aria-label="Search translations" />
    <select id="section" aria-label="Filter by section">
      <option value="">All sections (${sections.length})</option>
      ${sections.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
    </select>
    <span class="meta" id="count">${rows.length} / ${rows.length} keys · ${targetLocales.length + 1} locales</span>
  </div>
</header>
<table>
  <thead>
    <tr><th>Key</th>${tableHeaderCells}</tr>
  </thead>
  <tbody id="rows">
${tableBodyRows}
  </tbody>
</table>
<script>
const q = document.getElementById("q");
const sec = document.getElementById("section");
const count = document.getElementById("count");
const rows = Array.from(document.querySelectorAll("#rows tr"));
function filter() {
  const term = q.value.trim().toLowerCase();
  const s = sec.value;
  let visible = 0;
  for (const r of rows) {
    const ok = (!s || r.dataset.section === s) && (!term || r.dataset.search.includes(term));
    r.classList.toggle("hidden", !ok);
    if (ok) visible += 1;
  }
  count.textContent = visible + " / " + rows.length + " keys · ${targetLocales.length + 1} locales";
}
q.addEventListener("input", filter);
sec.addEventListener("change", filter);
</script>
</body>
</html>
`;
  writeFileSync(htmlPath, html, "utf8");

  return { jsonPath, mdPath, htmlPath, keyCount: rows.length, targetLocales };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseReportArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node scripts/build-localization-report.mjs [--all-languages | --language <tag>...] [--output <dir>]"
    );
    process.exit(0);
  }
  const result = await buildLocalizationReport({
    outputDir: options.outputDir,
    languages: options.languages,
    allLanguages: options.allLanguages || options.languages.length === 0
  });
  console.log(
    `Generated localization review report (${result.keyCount} keys across en + ${result.targetLocales.join(", ")}):\n  HTML: ${result.htmlPath}\n  MD:   ${result.mdPath}\n  JSON: ${result.jsonPath}`
  );
}
