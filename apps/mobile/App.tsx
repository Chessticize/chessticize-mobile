import React from "react";
import { LogBox, Platform, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";
import { mobilePlatformCapabilityFactoryFor } from "./src/platform/nativeMobilePlatformCapabilities";
import type { MobilePlatformCapabilities } from "./src/platform/mobilePlatformCapabilities";
import {
  createAdvancingTestClock,
  enableTestControlsFromLaunchConfig,
  resolveMarketingCaptureFrameFromLaunchConfig,
  resolveTestArrowDuelTargetCorrectFromLaunchConfig,
  resolveTestCustomTargetCorrectFromLaunchConfig,
  resolveTestNowMsFromLaunchConfig,
  resolveTestPuzzleSelectionIdFromLaunchConfig,
  resolveTestPuzzleSelectionSeedFromLaunchConfig,
  resolveTestStandardTargetCorrectFromLaunchConfig
} from "./src/platform/testLaunchConfig";
import {
  type AppStoreMarketingCaptureFixture,
  loadAppStoreMarketingCaptureFixture
} from "./src/testing/appStoreMarketingCapture";
import { shouldSuppressLogBoxWarnings } from "./src/releaseConfig";
import { createMobileSystemBackSource } from "./src/navigation/mobileSystemBack";
import {
  DEFAULT_DARK_BOARD_THEME,
  DEFAULT_LIGHT_BOARD_THEME,
  makeStyles,
  ThemeProvider,
  type AppearancePreference,
  type BoardThemeId,
  type ChessPieceSetId
} from "./src/theme";
import { I18nProvider, useTranslation, type LanguagePreference } from "./src/i18n";

enableTestControlsFromLaunchConfig();

if (shouldSuppressLogBoxWarnings()) {
  LogBox.ignoreAllLogs();
}

function App() {
  const marketingCaptureFrame = resolveMarketingCaptureFrameFromLaunchConfig();
  const platformFactory = mobilePlatformCapabilityFactoryFor(Platform.OS as "android" | "ios");
  const systemBack = React.useMemo(
    () => createMobileSystemBackSource(Platform.OS as "android" | "ios"),
    []
  );
  const [platformState, setPlatformState] = React.useState<AppPlatformState>(
    () => preparePlatformState(
      platformFactory.createSync(),
      marketingCaptureFrame
    )
  );
  const { marketingCaptureFixture, platformCapabilities } = platformState;
  const [appearance, setAppearance] = React.useState<AppearancePreference>(
    () => platformCapabilities?.storage.practiceService.getSettings().appearance ?? "system"
  );
  const [lightBoardTheme, setLightBoardTheme] = React.useState<BoardThemeId>(
    () => platformCapabilities?.storage.practiceService.getSettings().lightBoardTheme ?? DEFAULT_LIGHT_BOARD_THEME
  );
  const [darkBoardTheme, setDarkBoardTheme] = React.useState<BoardThemeId>(
    () => platformCapabilities?.storage.practiceService.getSettings().darkBoardTheme ?? DEFAULT_DARK_BOARD_THEME
  );
  const [pieceSet, setPieceSet] = React.useState<ChessPieceSetId>(
    () => platformCapabilities?.storage.practiceService.getSettings().pieceSet ?? "default"
  );
  const [languagePreference, setLanguagePreference] = React.useState<LanguagePreference>(
    () => platformCapabilities?.storage.practiceService.getSettings().language ?? "system"
  );
  React.useEffect(() => {
    if (platformCapabilities) {
      const settings = platformCapabilities.storage.practiceService.getSettings();
      setAppearance(settings.appearance);
      setLightBoardTheme(settings.lightBoardTheme);
      setDarkBoardTheme(settings.darkBoardTheme);
      setPieceSet(settings.pieceSet);
      setLanguagePreference(settings.language ?? "system");
    }
  }, [platformCapabilities]);
  const [loadError, setLoadError] = React.useState<string | undefined>(undefined);
  const testNowMs = resolveTestNowMsFromLaunchConfig();
  const arrowDuelTargetCorrect = resolveTestArrowDuelTargetCorrectFromLaunchConfig();
  const customTargetCorrect = resolveTestCustomTargetCorrectFromLaunchConfig();
  const puzzleSelectionId = resolveTestPuzzleSelectionIdFromLaunchConfig();
  const puzzleSelectionSeed = resolveTestPuzzleSelectionSeedFromLaunchConfig();
  const standardTargetCorrect = resolveTestStandardTargetCorrectFromLaunchConfig();
  const currentTimeMs = React.useMemo(
    () => marketingCaptureFixture
      ? () => marketingCaptureFixture.captureInstantMs
      : testNowMs === undefined ? undefined : createAdvancingTestClock(testNowMs),
    [marketingCaptureFixture, testNowMs]
  );
  React.useEffect(() => {
    if (platformCapabilities) {
      return;
    }
    let cancelled = false;
    platformFactory.create()
      .then((nextCapabilities) => {
        if (!cancelled) {
          setPlatformState(preparePlatformState(
            nextCapabilities,
            marketingCaptureFrame
          ));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [marketingCaptureFrame, platformCapabilities, platformFactory]);

  return (
    <SafeAreaProvider>
      <I18nProvider
        languagePreference={languagePreference}
        onLanguagePreferenceChange={setLanguagePreference}
      >
        <ThemeProvider
          appearance={appearance}
          darkBoardTheme={darkBoardTheme}
          lightBoardTheme={lightBoardTheme}
          pieceSet={pieceSet}
          onAppearanceChange={setAppearance}
          onDarkBoardThemeChange={setDarkBoardTheme}
          onLightBoardThemeChange={setLightBoardTheme}
          onPieceSetChange={setPieceSet}
        >
          {platformCapabilities ? (
            <PracticePocScreen
              platformCapabilities={platformCapabilities}
              arrowDuelTargetCorrect={arrowDuelTargetCorrect}
              currentTimeMs={currentTimeMs}
              customTargetCorrect={customTargetCorrect}
              sprintGuidanceEnabled
              puzzleSelectionId={puzzleSelectionId}
              puzzleSelectionSeed={puzzleSelectionSeed}
              personalBestChallengeDesignPreview={marketingCaptureFixture?.personalBestChallengeDesignPreview}
              runManagementEnabled
              settingsCaptureBottomInset={marketingCaptureFixture?.frameId === "private-offline-open-source"
                ? 420
                : undefined}
              sprintRulesDesignPreview={marketingCaptureFixture?.initialActiveState
                ? { initialActiveState: marketingCaptureFixture.initialActiveState }
                : undefined}
              standardTargetCorrect={standardTargetCorrect}
              systemBack={systemBack}
              tacticalProfilePresentation={marketingCaptureFixture?.tacticalProfilePresentation}
              themeCatalogPresentation={marketingCaptureFixture?.themeCatalogPresentation}
            />
          ) : (
            <LoadingScreen loadError={loadError} />
          )}
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

type AppPlatformState = {
  marketingCaptureFixture?: AppStoreMarketingCaptureFixture;
  platformCapabilities?: MobilePlatformCapabilities;
};

function preparePlatformState(
  platformCapabilities: MobilePlatformCapabilities | undefined,
  marketingCaptureFrame: string | undefined
): AppPlatformState {
  if (!platformCapabilities) {
    return {};
  }
  return {
    platformCapabilities,
    ...(marketingCaptureFrame === undefined
      ? {}
      : {
          marketingCaptureFixture: loadAppStoreMarketingCaptureFixture(
            marketingCaptureFrame,
            platformCapabilities.storage.practiceService
          )
        })
  };
}

function LoadingScreen({ loadError }: { loadError: string | undefined }): React.JSX.Element {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.loadingRoot}>
      <Text style={styles.loadingTitle} testID={loadError ? "puzzle-pack-load-error" : "puzzle-pack-loading"}>
        {loadError ? t("loading.errorTitle") : t("loading.title")}
      </Text>
      {loadError ? <Text style={styles.loadingDetail}>{loadError}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: theme.colors.launch.background
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.launch.title
  },
  loadingDetail: {
    marginTop: 8,
    fontSize: 13,
    color: theme.colors.launch.detail,
    textAlign: "center"
  }
}));

export default App;
