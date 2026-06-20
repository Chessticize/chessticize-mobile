import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticePocScreen } from "./src/components/PracticePocScreen";

function App() {
  return (
    <SafeAreaProvider>
      <PracticePocScreen />
    </SafeAreaProvider>
  );
}

export default App;
