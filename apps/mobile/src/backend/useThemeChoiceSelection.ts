import { useCallback, useMemo, useState } from "react";
import {
  ALL_THEME_SELECTION,
  applyThemeChoiceIntent,
  namedThemesForSelection,
  normalizeThemeChoiceSelection,
  SERVER_CURATED_THEMES,
  type ThemeChoiceIntent
} from "../../../../packages/core/src/index.ts";

export type ThemeChoiceSelectionController = {
  namedThemes: string[];
  selection: string[];
  dispatch: (intent: ThemeChoiceIntent) => void;
};

export function normalizeStoredThemeChoiceSelection(themes?: readonly string[]): string[] {
  return normalizeThemeChoiceSelection(themes, SERVER_CURATED_THEMES);
}

export function useThemeChoiceSelection({
  controlledSelection,
  initialSelection = [ALL_THEME_SELECTION],
  onControlledSelectionChange
}: {
  controlledSelection?: readonly string[];
  initialSelection?: readonly string[];
  onControlledSelectionChange?: (themes: string[]) => void;
} = {}): ThemeChoiceSelectionController {
  const [localSelection, setLocalSelection] = useState<string[]>(() =>
    normalizeStoredThemeChoiceSelection(initialSelection)
  );
  const selection = useMemo(
    () => normalizeStoredThemeChoiceSelection(controlledSelection ?? localSelection),
    [controlledSelection, localSelection]
  );
  const namedThemes = useMemo(
    () => namedThemesForSelection(selection),
    [selection]
  );
  const dispatch = useCallback((intent: ThemeChoiceIntent): void => {
    const nextSelection = applyThemeChoiceIntent(selection, intent, SERVER_CURATED_THEMES);
    if (controlledSelection !== undefined && onControlledSelectionChange) {
      onControlledSelectionChange(nextSelection);
      return;
    }
    setLocalSelection(nextSelection);
  }, [controlledSelection, onControlledSelectionChange, selection]);

  return { dispatch, namedThemes, selection };
}
