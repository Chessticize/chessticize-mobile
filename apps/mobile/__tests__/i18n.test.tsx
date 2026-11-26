import React, { useState } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import {
  DEFAULT_LOCALE,
  enMessages,
  getRegisteredCatalog,
  I18nProvider,
  LANGUAGE_NATIVE_LABELS,
  SUPPORTED_LOCALES,
  translate,
  useI18n,
  type LanguagePreference,
  type MessageKey
} from "../src/i18n/index.ts";
import { customThemeLabel } from "../src/components/practice/shared/themeCatalog.ts";
import { whatsNewContentFor } from "../src/whatsNew/whatsNewContent.ts";
import { sessionGuideStepCopy } from "../src/components/sessionGuideSteps.ts";
import { readDevicePreferredLanguages } from "../src/platform/deviceLocale.ts";
import { SettingsPanel } from "../src/components/practice/settings/SettingsPanel.tsx";
import { MOBILE_APPLICATION_METADATA_LINKS } from "../src/platform/mobilePlatformCapabilities.ts";
import type { MoveFeedbackPreferences } from "../src/platform/moveFeedback.ts";
import { buildPracticeAdaptiveLayout } from "../src/components/adaptivePracticeLayout.ts";

const TEST_MOVE_FEEDBACK_PREFERENCES: MoveFeedbackPreferences = {
  hapticsEnabled: true,
  soundEnabled: true
};

const TEST_ADAPTIVE_LAYOUT = buildPracticeAdaptiveLayout({
  fontScale: 1,
  height: 844,
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
  width: 390
});

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{\w+\}\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe("i18n runtime & locale catalogs", () => {
  it("translates strings, interpolates placeholders, and selects singular/plural forms", () => {
    expect(translate("en", "tabs.practice")).toBe("Practice");
    expect(translate("en", "common.ratingValue", { rating: 1450 })).toBe("Rating 1450");
    expect(translate("en", "common.puzzlesCount", { count: 1 })).toBe("1 puzzle");
    expect(translate("en", "common.puzzlesCount", { count: 4 })).toBe("4 puzzles");
    expect(translate("en", "tabs.reviewBadgeOverdueAccessibility", { count: 1, overdueCount: 1 }))
      .toBe("1 due review, 1 overdue");
    expect(translate("en", "tabs.reviewBadgeOverdueAccessibility", { count: 3, overdueCount: 2 }))
      .toBe("3 due reviews, 2 overdue");
  });

  it("registers real translations and accurate chess terminology for every supported locale", () => {
    expect(translate("zh-Hans", "tabs.practice")).toBe("练习");
    expect(translate("zh-Hans", "themes.fork")).toBe("捉双");
    expect(translate("zh-Hans", "themes.smotheredMate")).toBe("闷杀");
    expect(translate("zh-Hans", "common.puzzlesCount", { count: 3 })).toBe("3 题");

    expect(translate("zh-Hant", "tabs.practice")).toBe("練習");
    expect(translate("zh-Hant", "themes.fork")).toBe("捉雙");
    expect(translate("zh-Hant", "themes.smotheredMate")).toBe("悶殺");
    expect(translate("zh-Hant", "common.puzzlesCount", { count: 3 })).toBe("3 題");

    expect(translate("ja", "tabs.practice")).toBe("練習");
    expect(translate("ja", "themes.fork")).toBe("フォーク");
    expect(translate("ja", "themes.backRankMate")).toBe("バックランクメイト");
    expect(translate("ja", "common.puzzlesCount", { count: 3 })).toBe("3 問");

    expect(translate("ko", "tabs.practice")).toBe("연습");
    expect(translate("ko", "themes.fork")).toBe("포크");
    expect(translate("ko", "themes.smotheredMate")).toBe("스머더드 메이트");
    expect(translate("ko", "common.puzzlesCount", { count: 3 })).toBe("3문제");

    expect(translate("es", "tabs.practice")).toBe("Práctica");
    expect(translate("es", "themes.backRankMate")).toBe("Mate del pasillo");
    expect(translate("es", "themes.smotheredMate")).toBe("Mate de la coz");
    expect(translate("es", "common.puzzlesCount", { count: 1 })).toBe("1 ejercicio");
    expect(translate("es", "common.puzzlesCount", { count: 3 })).toBe("3 ejercicios");

    expect(translate("de", "tabs.practice")).toBe("Training");
    expect(translate("de", "themes.backRankMate")).toBe("Grundreihenmatt");
    expect(translate("de", "themes.intermezzo")).toBe("Zwischenzug");
    expect(translate("de", "common.puzzlesCount", { count: 1 })).toBe("1 Aufgabe");
    expect(translate("de", "common.puzzlesCount", { count: 3 })).toBe("3 Aufgaben");

    expect(translate("fr", "tabs.practice")).toBe("Pratique");
    expect(translate("fr", "themes.backRankMate")).toBe("Mat du couloir");
    expect(translate("fr", "themes.smotheredMate")).toBe("Mat à l’étouffée");
    expect(translate("fr", "common.puzzlesCount", { count: 0 })).toBe("0 problème");
    expect(translate("fr", "common.puzzlesCount", { count: 1 })).toBe("1 problème");
    expect(translate("fr", "common.puzzlesCount", { count: 3 })).toBe("3 problèmes");

    expect(translate("pt-BR", "tabs.practice")).toBe("Prática");
    expect(translate("pt-BR", "themes.fork")).toBe("Garfo");
    expect(translate("pt-BR", "themes.smotheredMate")).toBe("Mate sufocado");
    expect(translate("pt-BR", "common.puzzlesCount", { count: 1 })).toBe("1 problema");
    expect(translate("pt-BR", "common.puzzlesCount", { count: 3 })).toBe("3 problemas");

    for (const locale of SUPPORTED_LOCALES) {
      expect(customThemeLabel("fork", locale).length).toBeGreaterThan(0);
      expect(whatsNewContentFor("ios", locale).title.length).toBeGreaterThan(0);
      expect(sessionGuideStepCopy("session_progress", { focusedRun: false, mode: "standard" }, locale).title.length)
        .toBeGreaterThan(0);
    }
  });

  it("locks device locale detection to English under Jest for deterministic tests", () => {
    expect(readDevicePreferredLanguages()).toEqual([DEFAULT_LOCALE]);
  });

  it("has 100% key parity, non-empty values, and matching placeholders across all 9 locales", () => {
    const enKeys = Object.keys(enMessages).sort() as MessageKey[];
    expect(enKeys.length).toBeGreaterThan(200);

    for (const locale of SUPPORTED_LOCALES) {
      const catalog = getRegisteredCatalog(locale);
      const localeKeys = Object.keys(catalog).sort() as MessageKey[];
      expect(localeKeys).toEqual(enKeys);

      for (const key of enKeys) {
        const enEntry = enMessages[key];
        const entry = catalog[key];
        if (typeof enEntry === "string") {
          expect(typeof entry).toBe("string");
          const str = entry as string;
          expect(str.trim().length).toBeGreaterThan(0);
          expect(extractPlaceholders(str)).toEqual(extractPlaceholders(enEntry));
        } else {
          const enPlural = enEntry as { readonly one?: string; readonly other: string };
          expect(typeof entry).toBe("object");
          const plural = entry as { readonly one?: string; readonly other: string };
          expect(plural.other.trim().length).toBeGreaterThan(0);
          expect(extractPlaceholders(plural.other)).toEqual(extractPlaceholders(enPlural.other));
          if (plural.one !== undefined) {
            expect(plural.one.trim().length).toBeGreaterThan(0);
            expect(extractPlaceholders(plural.one)).toEqual(extractPlaceholders(enPlural.one ?? enPlural.other));
          }
        }
      }
    }
  });

  it("updates consumers live when I18nProvider switches language preference", () => {
    let setPref: ((next: LanguagePreference) => void) | undefined;

    function Probe(): React.JSX.Element {
      const { languagePreference, locale, setLanguagePreference, t } = useI18n();
      setPref = setLanguagePreference;
      return (
        <>
          <Text testID="probe-locale">{locale}</Text>
          <Text testID="probe-pref">{languagePreference}</Text>
          <Text testID="probe-title">{t("tabs.practice")}</Text>
        </>
      );
    }

    function Harness(): React.JSX.Element {
      const [pref, setPreference] = useState<LanguagePreference>("system");
      return (
        <I18nProvider
          languagePreference={pref}
          preferredLanguages={["en-US"]}
          onLanguagePreferenceChange={setPreference}
        >
          <Probe />
        </I18nProvider>
      );
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Harness />);
    });

    expect(textOf(renderer, "probe-locale")).toBe("en");
    expect(textOf(renderer, "probe-title")).toBe("Practice");

    act(() => {
      setPref?.("de");
    });

    expect(textOf(renderer, "probe-locale")).toBe("de");
    expect(textOf(renderer, "probe-pref")).toBe("de");
    expect(textOf(renderer, "probe-title")).toBe("Training");

    act(() => {
      setPref?.("zh-Hans");
    });

    expect(textOf(renderer, "probe-locale")).toBe("zh-Hans");
    expect(textOf(renderer, "probe-title")).toBe("练习");

    act(() => {
      setPref?.("system");
    });

    expect(textOf(renderer, "probe-locale")).toBe("en");
    expect(textOf(renderer, "probe-title")).toBe("Practice");
  });

  it("declares all supported locales in native iOS and Android configuration", () => {
    const appRoot = process.cwd();
    const infoPlist = readFileSync(join(appRoot, "ios", "ChessticizeMobile", "Info.plist"), "utf8");
    const pbxproj = readFileSync(
      join(appRoot, "ios", "ChessticizeMobile.xcodeproj", "project.pbxproj"),
      "utf8"
    );
    const manifest = readFileSync(
      join(appRoot, "android", "app", "src", "main", "AndroidManifest.xml"),
      "utf8"
    );
    const localesConfig = readFileSync(
      join(appRoot, "android", "app", "src", "main", "res", "xml", "locales_config.xml"),
      "utf8"
    );

    expect(infoPlist).toContain("<key>CFBundleLocalizations</key>");
    for (const locale of SUPPORTED_LOCALES) {
      expect(infoPlist).toContain(`<string>${locale}</string>`);
      expect(localesConfig).toContain(`android:name="${locale}"`);
      const lprojPath = join(appRoot, "ios", "ChessticizeMobile", `${locale}.lproj`, "InfoPlist.strings");
      expect(existsSync(lprojPath)).toBe(true);
      expect(pbxproj).toContain(`${locale}.lproj/InfoPlist.strings`);
    }
    expect(pbxproj).toContain('"zh-Hans"');
    expect(pbxproj).toContain('"zh-Hant"');
    expect(pbxproj).toContain('"pt-BR"');
    expect(pbxproj).toContain("InfoPlist.strings in Resources");
    expect(manifest).toContain('android:localeConfig="@xml/locales_config"');

    for (const qualifier of [
      "values",
      "values-zh-rCN",
      "values-zh-rTW",
      "values-zh-rHK",
      "values-ja",
      "values-ko",
      "values-es",
      "values-de",
      "values-fr",
      "values-pt-rBR"
    ]) {
      const stringsPath = join(appRoot, "android", "app", "src", "main", "res", qualifier, "strings.xml");
      expect(existsSync(stringsPath)).toBe(true);
      const xml = readFileSync(stringsPath, "utf8");
      expect(xml).toContain('<string name="app_name">Chessticize</string>');
      expect(xml).toContain('<string name="review_reminders_channel_name">');
      expect(xml).toContain('<string name="review_reminders_channel_description">');
    }
  });
});

describe("Settings language selector", () => {
  it("lists System plus all supported locales in their native names and switches on tap", () => {
    const onLanguageChange = jest.fn<void, [LanguagePreference]>();

    function SettingsHarness(): React.JSX.Element {
      const [language, setLanguage] = useState<LanguagePreference>("system");
      return (
        <I18nProvider
          languagePreference={language}
          preferredLanguages={["en-US"]}
          onLanguagePreferenceChange={(next) => {
            setLanguage(next);
            onLanguageChange(next);
          }}
        >
          <SettingsPanel
            adaptiveLayout={TEST_ADAPTIVE_LAYOUT}
            advancedRatingsOpen={false}
            appearance="system"
            applicationMetadata={{
              ...MOBILE_APPLICATION_METADATA_LINKS,
              buildNumber: "1",
              versionName: "1.6.0"
            }}
            darkBoardTheme="graphite"
            feedbackIssuesOpener={async () => undefined}
            iCloudSyncEnabled={false}
            iCloudSyncInProgress={false}
            iCloudSyncStatus="Off"
            language={language}
            lightBoardTheme="slate"
            moveFeedbackPreferences={TEST_MOVE_FEEDBACK_PREFERENCES}
            notificationPermissionStatus="authorized"
            pieceSet="default"
            progressProtection={{ kind: "icloud_sync" }}
            ratings={[]}
            reminderPlatform="ios"
            reviewReminderPreference={{ mode: "off" }}
            reviewReminderScheduleStatus="Off"
            showRatingControls={false}
            showSprintGuideReset={false}
            standardRating={1200}
            onAdjustRating={() => ({
              games: 0,
              generation: 1,
              key: "standard",
              rating: 1200,
              rd: 150,
              updatedAt: "2026-01-01T00:00:00.000Z",
              volatility: 0.06
            })}
            onAdvancedRatingsOpenChange={() => undefined}
            onAppearanceChange={() => undefined}
            onDarkBoardThemeChange={() => undefined}
            onLanguageChange={(next) => {
              setLanguage(next);
              onLanguageChange(next);
            }}
            onLightBoardThemeChange={() => undefined}
            onPieceSetChange={() => undefined}
            onMoveFeedbackPreferencesChange={() => undefined}
            onOpenNotificationSettings={async () => undefined}
            onOpenWhatsNew={() => undefined}
            onRequestReviewReminderPermission={async () => "authorized"}
            onResetSprintGuides={() => undefined}
            onSaveICloudSyncEnabled={() => undefined}
            onSaveReviewReminderPreference={() => undefined}
            onSyncICloudNow={async () => "Synced"}
          />
        </I18nProvider>
      );
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsHarness />);
    });

    const sectionTestIds = renderer.root
      .findAll((node) => typeof node.type === "string" && typeof node.props?.testID === "string" && node.props.testID.endsWith("-section"))
      .map((node) => node.props.testID);
    expect(sectionTestIds).toEqual([
      "settings-language-section",
      "settings-appearance-section",
      "settings-move-feedback-section",
      "settings-notifications-section",
      "settings-sync-section",
      "settings-feedback-section",
      "settings-about-section"
    ]);

    expect(textOf(renderer, "settings-language-row")).toContain("Follow device language (English)");
    const trailing = renderer.root.findByProps({ testID: "settings-language-row-trailing" });
    expect(extractText(trailing)).toContain("System");
    expect(trailing.props.style).toMatchObject({ alignItems: "center", flexDirection: "row" });

    act(() => {
      renderer.root.findByProps({ testID: "settings-language-row" }).props.onPress();
    });

    for (const code of SUPPORTED_LOCALES) {
      const option = renderer.root.findByProps({ testID: `settings-language-option-${code}` });
      expect(extractText(option)).toContain(LANGUAGE_NATIVE_LABELS[code]);
    }

    act(() => {
      renderer.root.findByProps({ testID: "settings-language-option-zh-Hans" }).props.onPress();
    });

    expect(onLanguageChange).toHaveBeenCalledWith("zh-Hans");
    expect(textOf(renderer, "settings-language-row")).toContain("简体中文");
    expect(extractText(renderer.root.findByProps({ testID: "settings-language-row-trailing" }))).toContain("简体中文");

    // Re-open the picker while an explicit override is active: the System row must still show the
    // device's resolved system language (English), not the active override (简体中文).
    act(() => {
      renderer.root.findByProps({ testID: "settings-language-row" }).props.onPress();
    });
    const systemOptionWhileOverridden = textOf(renderer, "settings-language-option-system");
    expect(systemOptionWhileOverridden).toContain("English");
    expect(systemOptionWhileOverridden).not.toContain("简体中文");

    // Switching back to System should restore the device locale and report status in that locale.
    act(() => {
      renderer.root.findByProps({ testID: "settings-language-option-system" }).props.onPress();
    });
    expect(onLanguageChange).toHaveBeenLastCalledWith("system");
    expect(textOf(renderer, "settings-language-row")).toContain("Follow device language (English)");
    expect(textOf(renderer, "settings-status-message")).toContain("System");
  });
});

function textOf(renderer: TestRenderer.ReactTestRenderer, testID: string): string {
  return extractText(renderer.root.findByProps({ testID }));
}

function extractText(node: TestRenderer.ReactTestInstance | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children
    .map((child) => (typeof child === "string" ? child : extractText(child)))
    .join("");
}
