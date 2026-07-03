import React from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";
import { createPersistentMobilePracticeService } from "./src/backend/mobilePractice";

LogBox.ignoreAllLogs();

function App() {
  return (
    <SafeAreaProvider>
      <PracticePocScreen practiceServiceFactory={createPersistentMobilePracticeService} />
    </SafeAreaProvider>
  );
}

export default App;
