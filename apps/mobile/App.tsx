import React from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";

LogBox.ignoreAllLogs();

function App() {
  return (
    <SafeAreaProvider>
      <PracticePocScreen />
    </SafeAreaProvider>
  );
}

export default App;
