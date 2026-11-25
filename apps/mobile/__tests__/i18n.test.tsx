import React, { useState } from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import {
  DEFAULT_LOCALE,
  enMessages,
  I18nProvider,
  LANGUAGE_NATIVE_LABELS,
  registerLocaleCatalog,
  SUPPORTED_LOCALES,
  translate,
  useI18n,
  type LanguagePreference,
  type LocaleCatalog,
  type MessageKey
} from "../src/i18n/index.ts";
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

describe("i18n runtime & English catalog", () => {
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

  it("falls back to English when a locale catalog has not been registered yet", () => {
    expect(translate("de", "tabs.settings")).toBe("Settings");
    expect(translate("zh-Hans", "common.puzzlesCount", { count: 2 })).toBe("2 puzzles");
  });

  it("locks device locale detection to English under Jest for deterministic tests", () => {
    expect(readDevicePreferredLanguages()).toEqual([DEFAULT_LOCALE]);
  });

  it("has non-empty, well-formed values for every key in the canonical English catalog", () => {
    const keys = Object.keys(enMessages) as MessageKey[];
    expect(keys.length).toBeGreaterThan(200);
    for (const key of keys) {
      const entry = enMessages[key];
      if (typeof entry === "string") {
        expect(entry.trim().length).toBeGreaterThan(0);
      } else {
        expect(entry.other.trim().length).toBeGreaterThan(0);
        if (entry.one !== undefined) {
          expect(entry.one.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("updates consumers live when I18nProvider switches language preference", () => {
    const testCatalog: LocaleCatalog = {
      ...enMessages,
      "tabs.practice": "Üben",
      "tabs.settings": "Einstellungen"
    };
    registerLocaleCatalog("de", testCatalog);

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
    expect(textOf(renderer, "probe-title")).toBe("Üben");

    act(() => {
      setPref?.("system");
    });

    expect(textOf(renderer, "probe-locale")).toBe("en");
    expect(textOf(renderer, "probe-title")).toBe("Practice");
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

    expect(textOf(renderer, "settings-language-row")).toContain("Follow device language (English)");

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
