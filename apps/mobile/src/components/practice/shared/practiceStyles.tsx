import { StyleSheet } from "react-native";
import type { Theme } from "../../../theme/index.ts";
import { FABRIC_SAFE_HIDDEN_TEXT_STYLE } from "./practiceUtils.ts";

// Style entries that several practice feature modules share (#685 phase 2).
// Each module spreads the entries it uses into its own makeStyles sheet with
// pickPracticeStyles, so every module keeps one sheet and one useStyles call.
function namedStyles<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  return styles;
}

function practiceStyles(theme: Theme) {
  return namedStyles({
    helperText: {
      color: theme.colors.text.tertiary,
      fontSize: 12,
      fontWeight: "600"
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: theme.colors.border.strong,
      borderRadius: 8,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      paddingHorizontal: 14
    },
    secondaryButtonText: {
      color: theme.colors.text.strong,
      fontSize: 13,
      fontWeight: "700"
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent.fill,
      borderRadius: 8,
      flex: 1,
      height: 42,
      justifyContent: "center",
      paddingHorizontal: 14
    },
    primaryButtonText: {
      color: theme.colors.text.onAccent,
      fontSize: 13,
      fontWeight: "800"
    },
    disabledButton: {
      opacity: 0.36
    },
    sectionLabel: {
      color: theme.colors.text.ink,
      fontSize: 15,
      fontWeight: "800"
    },
    listText: {
      color: theme.colors.text.strong,
      fontSize: 13,
      fontWeight: "600"
    },
    // Still used by the run timing editor and packs panel, which have not moved
    // to the ui/ primitives yet.
    settingsSection: {
      gap: 8
    },
    settingsRowCopy: {
      flex: 1,
      flexShrink: 1,
      gap: 2,
      minWidth: 0
    },
    settingsRowPressed: {
      backgroundColor: theme.colors.surfaceStrong
    },
    historyHeaderRow: {
      alignItems: "center",
      columnGap: theme.spacing.row,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      minHeight: theme.metrics.minTarget,
      rowGap: theme.spacing.inline
    },
    historyPanel: {
      gap: theme.spacing.row
    },
    historyPanelWide: {
      alignSelf: "center",
      maxWidth: 980,
      width: "100%"
    },
    reviewDueHiddenMetric: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
    accessibleMoveModalBackdrop: {
      alignItems: "center",
      backgroundColor: theme.colors.scrimSoft,
      flex: 1,
      justifyContent: "center",
      padding: 20
    },
    feedbackHandoffConfirmation: {
      backgroundColor: theme.colors.surfaceRaised,
      // Dark surfaceRaised matches the dimmed Home, so the card needs an edge.
      borderColor: theme.colors.border.default,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: theme.shape.sheet,
      gap: theme.spacing.row,
      maxWidth: 430,
      padding: 24,
      width: "100%"
    },
    feedbackHandoffActions: {
      gap: theme.spacing.group,
      marginTop: 4
    },
    homeRowCopy: {
      flex: 1,
      flexShrink: 1,
      gap: 2,
      minWidth: 0
    },
    editorRowLabel: {
      flex: 1,
      gap: 2,
      minWidth: 0
    },
    customSetupPanel: {
      alignSelf: "center",
      gap: theme.spacing.section,
      maxWidth: 760,
      width: "100%"
    },
    customConfigValue: {
      flexShrink: 1,
      marginLeft: "auto",
      textAlign: "right"
    },
    themeCatalogGroupLabel: {
      color: theme.colors.text.tertiary,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase"
    },
    historyThemeDisclosure: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44
    },
    historyThemeDisclosureCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 8
    },
    historyThemeAllRow: {
      alignItems: "flex-start"
    },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    optionButton: {
      alignItems: "center",
      borderColor: theme.colors.border.strong,
      borderRadius: 8,
      borderWidth: 1,
      flexBasis: "30%",
      flexGrow: 1,
      height: 36,
      justifyContent: "center",
      paddingHorizontal: 10
    },
    optionButtonActive: {
      backgroundColor: theme.colors.accent.s50,
      borderColor: theme.colors.accent.s600
    },
    optionButtonText: {
      color: theme.colors.text.strong,
      fontSize: 12,
      fontWeight: "800"
    },
    optionButtonTextActive: {
      color: theme.colors.accent.s700
    }
  });
}

export type PracticeStyleKey = keyof ReturnType<typeof practiceStyles>;

export function pickPracticeStyles<K extends PracticeStyleKey>(
  theme: Theme,
  keys: readonly K[]
): Pick<ReturnType<typeof practiceStyles>, K> {
  const all = practiceStyles(theme);
  const picked = {} as Pick<ReturnType<typeof practiceStyles>, K>;
  for (const key of keys) {
    picked[key] = all[key];
  }
  return picked;
}
