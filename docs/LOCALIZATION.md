# Localization Contract

Chessticize ships in **9 languages**:

| Tag | Native label | iOS `.lproj` | Android `values-*` |
| --- | --- | --- | --- |
| `en` | English | `en.lproj` | `values` |
| `zh-Hans` | 简体中文 | `zh-Hans.lproj` | `values-zh-rCN` |
| `zh-Hant` | 繁體中文 | `zh-Hant.lproj` | `values-zh-rTW`, `values-zh-rHK` |
| `ja` | 日本語 | `ja.lproj` | `values-ja` |
| `ko` | 한국어 | `ko.lproj` | `values-ko` |
| `es` | Español | `es.lproj` | `values-es` |
| `de` | Deutsch | `de.lproj` | `values-de` |
| `fr` | Français | `fr.lproj` | `values-fr` |
| `pt-BR` | Português (Brasil) | `pt-BR.lproj` | `values-pt-rBR` |

## Source of Truth & Scope

- **Core locale resolution:** `packages/core/src/locale.ts` defines `SUPPORTED_LOCALES`, `LANGUAGE_NATIVE_LABELS`, `matchSupportedLocale`, `resolvePreferredLocale`, `selectPluralCategory`, and `resolveFormattingLocale`. Keep `packages/core` free of React or React Native imports.
- **Message catalogs:** `apps/mobile/src/i18n/locales/en.ts` is the typed source of truth (`EnMessages` / `LocaleCatalog`). Every locale catalog (`zh-Hans.ts`, `zh-Hant.ts`, `ja.ts`, `ko.ts`, `es.ts`, `de.ts`, `fr.ts`, `pt-BR.ts`) uses `as const satisfies LocaleCatalog` and is registered in `apps/mobile/src/i18n/translate.ts`.
- **Device-local preference:** Language preference (`"system"` or a `SupportedLocale`) is stored locally in `PracticeSettings.language` and is **never synced via CloudKit `ProgressV2`**.
- **Region-independent formatting:** Switching the in-app language preserves the device's regional formatting conventions via `resolveFormattingLocale(locale, preferredLanguages)` while keeping default Jest runs deterministic (`en` → `en-US`).
- **Chess notation invariant:** Standard Algebraic Notation (SAN) piece letters (`K`, `Q`, `R`, `B`, `N`) and algebraic coordinates (`e4`, `Nf3`) remain international in every locale. Piece names in prose and accessibility labels are localized.
- **Terminology glossary:** Canonical product and chess terms live in `docs/localization-terminology.json`. Update the glossary intentionally when changing canonical product terminology.

## Native Platform Parity

- **iOS:** Every supported locale must be declared in `apps/mobile/ios/ChessticizeMobile/Info.plist` (`CFBundleLocalizations`), listed in `project.pbxproj` (`knownRegions`), and backed by `apps/mobile/ios/ChessticizeMobile/<locale>.lproj/InfoPlist.strings` in the `InfoPlist.strings` `PBXVariantGroup`. Do not set `CFBundleDisplayName` inside `InfoPlist.strings` so Debug (`Chessticize Dev`) and Release (`Chessticize`) identities stay distinct.
- **Android:** Every supported locale must be declared in `apps/mobile/android/app/src/main/res/xml/locales_config.xml` (referenced by `AndroidManifest.xml`), and each mapped `values*/strings.xml` directory must define `app_name`, `review_reminders_channel_name`, and `review_reminders_channel_description`. `ReviewReminderNotifications.ensureChannel` reads channel metadata from Android resources and refreshes it on `ACTION_LOCALE_CHANGED`.

## Rules for Adding or Changing UI Copy

1. Never hardcode new user-facing copy in components or presentation helpers; add a key to `apps/mobile/src/i18n/locales/en.ts` and translate it across all supported catalogs in the same PR.
2. Keep `{{placeholder}}` names identical across every locale and every plural branch.
3. Respect compact surface constraints:
   - Never loosen `PracticePrompt`'s fixed `frameHeight` invariant (board stability during Sprint puzzles).
   - Keep tab labels, segmented controls, board-theme tiles, and pill badges concise—especially in verbose locales (`de`, `fr`, `es`, `pt-BR`) and katakana-heavy Japanese (`ja`) at largest Dynamic Type.
4. Re-schedule pending review reminder notifications when the user changes language (handled in `useSettingsController.tsx`).

## Automated Checks & Human Review Reports

- **Guardrail check (runs in Core CI via `pnpm test:tooling`):**
  ```sh
  pnpm check:localizations
  ```
  Verifies 100% key parity, non-empty strings, exact placeholder & plural parity, `docs/localization-terminology.json` consistency, and native iOS/Android resource parity.
- **Side-by-side translation review report (writes to ignored `scratch/`):**
  ```sh
  pnpm report:localizations --all-languages
  ```
  Generates a searchable HTML review page (`scratch/localization-report/localization-review.html`), Markdown table, and JSON export. Do not commit generated reports.
- **Visual & interactive checks:**
  - Switch locales via the Storybook **Language** toolbar (`apps/mobile-lab/.storybook/preview.tsx`) across phone portrait, compact width, tablet, and largest text size.
  - Native live-switch and cold-launch persistence E2E coverage lives in `apps/mobile/e2e/language-settings.e2e.js`.
