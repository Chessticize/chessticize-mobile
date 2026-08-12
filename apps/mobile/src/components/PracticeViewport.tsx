import React, { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

export type PracticeViewportOverride = {
  width: number;
  height: number;
};

const PracticeViewportContext = createContext<PracticeViewportOverride | null>(null);

export function PracticeViewportProvider({
  children,
  value
}: React.PropsWithChildren<{ value: PracticeViewportOverride }>): React.JSX.Element {
  return (
    <PracticeViewportContext.Provider value={value}>
      {children}
    </PracticeViewportContext.Provider>
  );
}

export function usePracticeViewport(): ReturnType<typeof useWindowDimensions> {
  const viewportOverride = useContext(PracticeViewportContext);
  const windowDimensions = useWindowDimensions();

  return viewportOverride === null
    ? windowDimensions
    : {
        ...windowDimensions,
        ...viewportOverride
      };
}
