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
import { makeStyles, ThemeProvider, type AppearancePreference } from "./src/theme";

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
  React.useEffect(() => {
    if (platformCapabilities) {
      setAppearance(platformCapabilities.storage.practiceService.getSettings().appearance);
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
      <ThemeProvider appearance={appearance} onAppearanceChange={setAppearance}>
        {platformCapabilities ? (
          <PracticePocScreen
            platformCapabilities={platformCapabilities}
            arrowDuelTargetCorrect={arrowDuelTargetCorrect}
            currentTimeMs={currentTimeMs}
            customTargetCorrect={customTargetCorrect}
            sprintGuidanceEnabled
            puzzleSelectionId={puzzleSelectionId}
            puzzleSelectionSeed={puzzleSelectionSeed}
            runManagementEnabled
            settingsCaptureBottomInset={marketingCaptureFixture?.frameId === "private-offline-open-source"
              ? 420
              : undefined}
            sprintRulesDesignPreview={marketingCaptureFixture?.initialActiveState
              ? { initialActiveState: marketingCaptureFixture.initialActiveState }
              : undefined}
            standardTargetCorrect={standardTargetCorrect}
            systemBack={systemBack}
            themeCatalogPresentation={marketingCaptureFixture?.themeCatalogPresentation}
          />
        ) : (
          <LoadingScreen loadError={loadError} />
        )}
      </ThemeProvider>
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
  return (
    <View style={styles.loadingRoot}>
      <Text style={styles.loadingTitle} testID={loadError ? "puzzle-pack-load-error" : "puzzle-pack-loading"}>
        {loadError ? "Puzzle pack unavailable" : "Loading puzzle pack"}
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
