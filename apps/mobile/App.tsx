import React from "react";
import { LogBox, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";
import { mobilePlatformCapabilityFactoryFor } from "./src/backend/nativeMobilePlatformCapabilities";
import type { MobilePlatformCapabilities } from "./src/backend/mobilePlatformCapabilities";
import {
  createAdvancingTestClock,
  enableTestControlsFromLaunchConfig,
  resolveTestNowMsFromLaunchConfig,
  resolveTestPuzzleSelectionSeedFromLaunchConfig,
  resolveTestStandardTargetCorrectFromLaunchConfig
} from "./src/backend/testLaunchConfig";
import { shouldSuppressLogBoxWarnings } from "./src/releaseConfig";

enableTestControlsFromLaunchConfig();

if (shouldSuppressLogBoxWarnings()) {
  LogBox.ignoreAllLogs();
}

function App() {
  const platformFactory = mobilePlatformCapabilityFactoryFor(Platform.OS as "android" | "ios");
  const [platformCapabilities, setPlatformCapabilities] = React.useState<MobilePlatformCapabilities | undefined>(
    () => platformFactory.createSync()
  );
  const [loadError, setLoadError] = React.useState<string | undefined>(undefined);
  const testNowMs = resolveTestNowMsFromLaunchConfig();
  const puzzleSelectionSeed = resolveTestPuzzleSelectionSeedFromLaunchConfig();
  const standardTargetCorrect = resolveTestStandardTargetCorrectFromLaunchConfig();
  const currentTimeMs = React.useMemo(
    () => testNowMs === undefined ? undefined : createAdvancingTestClock(testNowMs),
    [testNowMs]
  );
  React.useEffect(() => {
    if (platformCapabilities) {
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
  }, [platformCapabilities, platformFactory]);

  return (
    <SafeAreaProvider>
      {platformCapabilities ? (
        <PracticePocScreen
          platformCapabilities={platformCapabilities}
          currentTimeMs={currentTimeMs}
          puzzleSelectionSeed={puzzleSelectionSeed}
          standardTargetCorrect={standardTargetCorrect}
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
