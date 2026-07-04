import React from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";
import { createPersistentMobilePracticeService } from "./src/backend/mobilePractice";
import { resolveTestNowMsFromLaunchConfig } from "./src/backend/testLaunchConfig";
import { shouldSuppressLogBoxWarnings } from "./src/releaseConfig";

if (shouldSuppressLogBoxWarnings()) {
  LogBox.ignoreAllLogs();
}

function App() {
  const testNowMs = resolveTestNowMsFromLaunchConfig();
  const currentTimeMs = testNowMs === undefined ? undefined : () => testNowMs;

  return (
    <SafeAreaProvider>
      <PracticePocScreen practiceServiceFactory={createPersistentMobilePracticeService} currentTimeMs={currentTimeMs} />
    </SafeAreaProvider>
  );
}

export default App;
