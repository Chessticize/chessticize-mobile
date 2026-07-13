import React from "react";
import { LogBox, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";
import {
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync
} from "./src/backend/mobilePractice";
import type { PracticeService } from "../../packages/storage/src/practice-service.ts";
import { createAdvancingTestClock, resolveTestNowMsFromLaunchConfig } from "./src/backend/testLaunchConfig";
import { shouldSuppressLogBoxWarnings } from "./src/releaseConfig";

if (shouldSuppressLogBoxWarnings()) {
  LogBox.ignoreAllLogs();
}

function App() {
  const [service, setService] = React.useState<PracticeService | undefined>(() => createPersistentMobilePracticeServiceSync());
  const [loadError, setLoadError] = React.useState<string | undefined>(undefined);
  const testNowMs = resolveTestNowMsFromLaunchConfig();
  const currentTimeMs = React.useMemo(
    () => testNowMs === undefined ? undefined : createAdvancingTestClock(testNowMs),
    [testNowMs]
  );
  const practiceServiceFactory = React.useCallback(() => {
    if (!service) {
      throw new Error("Practice service is not ready");
    }
    return service;
  }, [service]);

  React.useEffect(() => {
    if (service) {
      return;
    }
    let cancelled = false;
    createPersistentMobilePracticeService()
      .then((nextService) => {
        if (!cancelled) {
          setService(nextService);
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
  }, [service]);

  return (
    <SafeAreaProvider>
      {service ? (
        <PracticePocScreen practiceServiceFactory={practiceServiceFactory} currentTimeMs={currentTimeMs} />
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
