#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const ANDROID_QUALIFIERS_BY_LOCALE = {
  en: ["values"],
  "zh-Hans": ["values-zh-rCN"],
  "zh-Hant": ["values-zh-rTW", "values-zh-rHK"],
  ja: ["values-ja"],
  ko: ["values-ko"],
  es: ["values-es"],
  de: ["values-de"],
  fr: ["values-fr"],
  "pt-BR": ["values-pt-rBR"]
};

const REQUIRED_ANDROID_STRINGS = [
  "app_name",
  "review_reminders_channel_name",
  "review_reminders_channel_description"
];

export function extractPlaceholders(template) {
  const matches = template.match(/\{\{\w+\}\}/g) ?? [];
  return [...new Set(matches)].sort();
}

export function validateCatalogs({ supportedLocales, catalogs, glossary }) {
  const errors = [];
  const enCatalog = catalogs.en;
  if (!enCatalog) {
    errors.push("Missing base English catalog (en).");
    return errors;
  }

  const enKeys = Object.keys(enCatalog).sort();
  const enKeySet = new Set(enKeys);

  for (const locale of supportedLocales) {
    const catalog = catalogs[locale];
    if (!catalog) {
      errors.push(`Missing registered message catalog for supported locale "${locale}".`);
      continue;
    }

    const localeKeys = Object.keys(catalog).sort();
    const localeKeySet = new Set(localeKeys);

    for (const key of enKeys) {
      if (!localeKeySet.has(key)) {
        errors.push(`[${locale}] Missing key "${key}".`);
      }
    }
    for (const key of localeKeys) {
      if (!enKeySet.has(key)) {
        errors.push(`[${locale}] Extra key "${key}" not present in en.ts.`);
      }
    }

    for (const key of enKeys) {
      if (!localeKeySet.has(key)) {
        continue;
      }
      const enValue = enCatalog[key];
      const value = catalog[key];
      if (typeof enValue === "string") {
        if (typeof value !== "string") {
          errors.push(`[${locale}] Key "${key}" must be a string.`);
          continue;
        }
        if (value.trim().length === 0) {
          errors.push(`[${locale}] Key "${key}" is empty.`);
          continue;
        }
        const expected = extractPlaceholders(enValue);
        const actual = extractPlaceholders(value);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          errors.push(
            `[${locale}] Key "${key}" placeholder mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`
          );
        }
      } else {
        if (!value || typeof value !== "object" || typeof value.other !== "string") {
          errors.push(`[${locale}] Plural key "${key}" must be an object with a string "other" branch.`);
          continue;
        }
        if (value.other.trim().length === 0) {
          errors.push(`[${locale}] Plural key "${key}.other" is empty.`);
        }
        const expectedOther = extractPlaceholders(enValue.other);
        const actualOther = extractPlaceholders(value.other);
        if (JSON.stringify(actualOther) !== JSON.stringify(expectedOther)) {
          errors.push(
            `[${locale}] Plural key "${key}.other" placeholder mismatch: expected ${JSON.stringify(expectedOther)}, got ${JSON.stringify(actualOther)}.`
          );
        }
        if (value.one !== undefined) {
          if (typeof value.one !== "string" || value.one.trim().length === 0) {
            errors.push(`[${locale}] Plural key "${key}.one" must be a non-empty string when provided.`);
          } else {
            const expectedOne = extractPlaceholders(enValue.one ?? enValue.other);
            const actualOne = extractPlaceholders(value.one);
            if (JSON.stringify(actualOne) !== JSON.stringify(expectedOne)) {
              errors.push(
                `[${locale}] Plural key "${key}.one" placeholder mismatch: expected ${JSON.stringify(expectedOne)}, got ${JSON.stringify(actualOne)}.`
              );
            }
          }
        }
      }
    }
  }

  if (glossary?.terms) {
    for (const term of glossary.terms) {
      if (!enKeySet.has(term.key)) {
        errors.push(`[glossary] Term "${term.id}" references unknown key "${term.key}".`);
        continue;
      }
      for (const locale of supportedLocales) {
        const expected = term.translations?.[locale];
        if (typeof expected !== "string" || expected.trim().length === 0) {
          errors.push(`[glossary] Term "${term.id}" is missing a canonical translation for "${locale}".`);
          continue;
        }
        const actual = catalogs[locale]?.[term.key];
        if (actual !== expected) {
          errors.push(
            `[glossary] Drift for "${term.id}" (${term.key}) in "${locale}": glossary expects ${JSON.stringify(expected)}, catalog has ${JSON.stringify(actual)}.`
          );
        }
      }
    }
  }

  return errors;
}

export function validateNativeParity({ repoRoot, supportedLocales }) {
  const errors = [];
  const mobileRoot = path.join(repoRoot, "apps", "mobile");

  const infoPlistPath = path.join(mobileRoot, "ios", "ChessticizeMobile", "Info.plist");
  const pbxprojPath = path.join(mobileRoot, "ios", "ChessticizeMobile.xcodeproj", "project.pbxproj");
  const manifestPath = path.join(mobileRoot, "android", "app", "src", "main", "AndroidManifest.xml");
  const localesConfigPath = path.join(mobileRoot, "android", "app", "src", "main", "res", "xml", "locales_config.xml");

  for (const requiredFile of [infoPlistPath, pbxprojPath, manifestPath, localesConfigPath]) {
    if (!existsSync(requiredFile)) {
      errors.push(`Missing required native localization file: ${path.relative(repoRoot, requiredFile)}.`);
    }
  }
  if (errors.length > 0) {
    return errors;
  }

  const infoPlist = readFileSync(infoPlistPath, "utf8");
  const pbxproj = readFileSync(pbxprojPath, "utf8");
  const manifest = readFileSync(manifestPath, "utf8");
  const localesConfig = readFileSync(localesConfigPath, "utf8");

  if (!infoPlist.includes("<key>CFBundleLocalizations</key>")) {
    errors.push("iOS Info.plist is missing CFBundleLocalizations.");
  }
  if (!pbxproj.includes("InfoPlist.strings in Resources")) {
    errors.push("iOS project.pbxproj is missing InfoPlist.strings in PBXResourcesBuildPhase.");
  }
  if (!manifest.includes('android:localeConfig="@xml/locales_config"')) {
    errors.push("AndroidManifest.xml is missing android:localeConfig=\"@xml/locales_config\".");
  }

  for (const locale of supportedLocales) {
    if (!infoPlist.includes(`<string>${locale}</string>`)) {
      errors.push(`iOS Info.plist CFBundleLocalizations is missing "${locale}".`);
    }
    const lprojPath = path.join(mobileRoot, "ios", "ChessticizeMobile", `${locale}.lproj`, "InfoPlist.strings");
    if (!existsSync(lprojPath)) {
      errors.push(`Missing iOS .lproj resource: ${path.relative(repoRoot, lprojPath)}.`);
    }
    if (!pbxproj.includes(`${locale}.lproj/InfoPlist.strings`)) {
      errors.push(`iOS project.pbxproj does not reference "${locale}.lproj/InfoPlist.strings".`);
    }
    if (!localesConfig.includes(`android:name="${locale}"`)) {
      errors.push(`Android locales_config.xml is missing "${locale}".`);
    }

    const qualifiers = ANDROID_QUALIFIERS_BY_LOCALE[locale];
    if (!qualifiers) {
      errors.push(`No Android resource qualifier mapping configured for supported locale "${locale}".`);
      continue;
    }
    for (const qualifier of qualifiers) {
      const stringsPath = path.join(mobileRoot, "android", "app", "src", "main", "res", qualifier, "strings.xml");
      if (!existsSync(stringsPath)) {
        errors.push(`Missing Android strings resource: ${path.relative(repoRoot, stringsPath)}.`);
        continue;
      }
      const xml = readFileSync(stringsPath, "utf8");
      for (const stringName of REQUIRED_ANDROID_STRINGS) {
        const match = xml.match(new RegExp(`<string name="${stringName}">([^<]+)</string>`));
        if (!match || match[1].trim().length === 0) {
          errors.push(`Android ${qualifier}/strings.xml is missing a non-empty "${stringName}".`);
        }
      }
    }
  }

  return errors;
}

export async function loadRepositoryLocalizationData(repoRoot = DEFAULT_REPO_ROOT) {
  const localeModule = await import(
    pathToFileURL(path.join(repoRoot, "packages", "core", "src", "locale.ts")).href
  );
  const translateModule = await import(
    pathToFileURL(path.join(repoRoot, "apps", "mobile", "src", "i18n", "translate.ts")).href
  );
  const glossaryPath = path.join(repoRoot, "docs", "localization-terminology.json");
  const glossary = existsSync(glossaryPath) ? JSON.parse(readFileSync(glossaryPath, "utf8")) : null;

  const supportedLocales = [...localeModule.SUPPORTED_LOCALES];
  const catalogs = {};
  for (const locale of supportedLocales) {
    catalogs[locale] = translateModule.getRegisteredCatalog(locale);
  }

  return {
    supportedLocales,
    nativeLabels: localeModule.LANGUAGE_NATIVE_LABELS,
    catalogs,
    glossary
  };
}

export async function checkLocalizations(repoRoot = DEFAULT_REPO_ROOT) {
  const { supportedLocales, catalogs, glossary } = await loadRepositoryLocalizationData(repoRoot);
  const errors = [
    ...validateCatalogs({ supportedLocales, catalogs, glossary }),
    ...validateNativeParity({ repoRoot, supportedLocales })
  ];
  return {
    ok: errors.length === 0,
    localeCount: supportedLocales.length,
    keyCount: Object.keys(catalogs.en ?? {}).length,
    glossaryTermCount: glossary?.terms?.length ?? 0,
    errors
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkLocalizations();
  if (!result.ok) {
    console.error(`Localization check failed with ${result.errors.length} issue(s):`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  console.log(
    `Localization check passed: ${result.localeCount} locales, ${result.keyCount} keys, ${result.glossaryTermCount} canonical glossary terms, native iOS/Android parity verified.`
  );
}
