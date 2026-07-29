import React from "react";
import { LogBox, Platform, StyleSheet, Text, View } from "react-native";
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
import { composeIOSMobilePlatformCapabilities } from "./src/platform/iosMobilePlatformCapabilities";
import {
  createAppStoreMarketingCaptureFixture
} from "./src/testing/appStoreMarketingCapture";
import { shouldSuppressLogBoxWarnings } from "./src/releaseConfig";
import { createMobileSystemBackSource } from "./src/navigation/mobileSystemBack";

enableTestControlsFromLaunchConfig();

if (shouldSuppressLogBoxWarnings()) {
  LogBox.ignoreAllLogs();
}

function App() {
  const marketingCaptureFrame = resolveMarketingCaptureFrameFromLaunchConfig();
  const marketingCaptureFixture = React.useMemo(
    () => marketingCaptureFrame === undefined
      ? undefined
      : createAppStoreMarketingCaptureFixture(marketingCaptureFrame),
    [marketingCaptureFrame]
  );
  const platformFactory = mobilePlatformCapabilityFactoryFor(Platform.OS as "android" | "ios");
  const systemBack = React.useMemo(
    () => createMobileSystemBackSource(Platform.OS as "android" | "ios"),
    []
  );
  const [platformCapabilities, setPlatformCapabilities] = React.useState<MobilePlatformCapabilities | undefined>(
    () => marketingCaptureFixture
      ? composeIOSMobilePlatformCapabilities(marketingCaptureFixture.practiceService)
      : platformFactory.createSync()
  );
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
    if (platformCapabilities || marketingCaptureFixture) {
      return;
    }
    let cancelled = false;
    platformFactory.create()
      .then((nextCapabilities) => {
        if (!cancelled) {
          setPlatformCapabilities(nextCapabilities);
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
  }, [marketingCaptureFixture, platformCapabilities, platformFactory]);

  return (
    <SafeAreaProvider>
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
          sprintRulesDesignPreview={marketingCaptureFixture?.initialActiveState
            ? { initialActiveState: marketingCaptureFixture.initialActiveState }
            : undefined}
          standardTargetCorrect={standardTargetCorrect}
          systemBack={systemBack}
        />
      ) : (
        <View style={styles.loadingRoot}>
          <Text style={styles.loadingTitle} testID={loadError ? "puzzle-pack-load-error" : "puzzle-pack-loading"}>
            {loadError ? "Puzzle pack unavailable" : "Loading puzzle pack"}
          </Text>
          {loadError ? <Text style={styles.loadingDetail}>{loadError}</Text> : null}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F7F7F2"
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1D201F"
  },
  loadingDetail: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B6258",
    textAlign: "center"
  }
});

export default App;
