import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export const MULTI_THEME_CHOICES = [
  { id: "mixed", label: "Mixed" },
  { id: "mate", label: "Mate" },
  { id: "endgame", label: "Endgame" },
  { id: "fork", label: "Fork" },
  { id: "pin", label: "Pin" },
  { id: "skewer", label: "Skewer" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "promotion", label: "Promotion" },
  { id: "hangingPiece", label: "Hanging Piece" },
  { id: "advancedPawn", label: "Advanced Pawn" }
] as const;

export type MultiThemeChoiceId = (typeof MULTI_THEME_CHOICES)[number]["id"];

export function nextMultiThemeSelection(
  selectedThemes: readonly MultiThemeChoiceId[],
  tappedTheme: MultiThemeChoiceId
): MultiThemeChoiceId[] {
  if (tappedTheme === "mixed") {
    return selectedThemes.includes("mixed") ? [] : ["mixed"];
  }

  const namedThemes = selectedThemes.filter((theme) => theme !== "mixed");
  return namedThemes.includes(tappedTheme)
    ? namedThemes.filter((theme) => theme !== tappedTheme)
    : [...namedThemes, tappedTheme];
}

export function MultiThemeChoicePrototype({
  initialSelectedThemes = ["fork", "pin"]
}: {
  initialSelectedThemes?: readonly MultiThemeChoiceId[];
}): React.JSX.Element {
  const [selectedThemes, setSelectedThemes] = useState<MultiThemeChoiceId[]>([
    ...initialSelectedThemes
  ]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      style={styles.scroller}
      testID="multi-theme-choice-prototype"
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>CUSTOM PRACTICE</Text>
            <Text style={styles.title}>Custom Sprint</Text>
          </View>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>DESIGN PREVIEW</Text>
          </View>
        </View>

        <View style={styles.configCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Themes</Text>
              <Text style={styles.sectionHint}>
                Tap to select or unselect. Mixed clears the other themes.
              </Text>
            </View>
            <Text style={styles.selectionCount} testID="multi-theme-selection-count">
              {selectedThemes.length} selected
            </Text>
          </View>

          <View
            accessibilityLabel="Puzzle themes"
            accessibilityRole="list"
            style={styles.themeGrid}
            testID="multi-theme-choice-grid"
          >
            {MULTI_THEME_CHOICES.map((theme) => {
              const checked = selectedThemes.includes(theme.id);
              return (
                <Pressable
                  key={theme.id}
                  accessibilityHint={
                    theme.id === "mixed"
                      ? "Clears all named theme selections"
                      : "Adds or removes this theme"
                  }
                  accessibilityLabel={`${theme.label} puzzle theme`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => {
                    setSelectedThemes((current) => nextMultiThemeSelection(current, theme.id));
                  }}
                  style={[styles.themeChip, checked ? styles.themeChipSelected : null]}
                  testID={`multi-theme-${theme.id}`}
                >
                  <Text
                    style={[
                      styles.themeChipText,
                      checked ? styles.themeChipTextSelected : null
                    ]}
                  >
                    {theme.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.contextCard}>
          <ContextRow label="Mode" value="Regular Puzzles" />
          <ContextRow label="Duration" value="5 min" />
          <ContextRow label="Time per puzzle" value="20 sec" />
          <ContextRow label="Estimated puzzles" value="~15" isLast />
        </View>

        <Text style={styles.boundaryNote}>
          This design preview changes theme selection only. Starting and saving remain outside this review.
        </Text>
      </View>
    </ScrollView>
  );
}

function ContextRow({
  isLast = false,
  label,
  value
}: {
  isLast?: boolean;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={[styles.contextRow, isLast ? styles.contextRowLast : null]}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={styles.contextValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: {
    backgroundColor: "#EEF2F7"
  },
  page: {
    alignItems: "center",
    minHeight: "100%",
    paddingHorizontal: 16,
    paddingVertical: 28
  },
  screen: {
    gap: 14,
    maxWidth: 560,
    width: "100%"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  eyebrow: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1
  },
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 2
  },
  previewBadge: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  previewBadgeText: {
    color: "#1D4ED8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7
  },
  configCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    gap: 16,
    padding: 16
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sectionCopy: {
    flex: 1,
    gap: 4
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900"
  },
  sectionHint: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17
  },
  selectionCount: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  themeChip: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  themeChipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  themeChipText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  themeChipTextSelected: {
    color: "#FFFFFF"
  },
  contextCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  contextRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  contextRowLast: {
    borderBottomWidth: 0
  },
  contextLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  contextValue: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "800"
  },
  boundaryNote: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
    textAlign: "center"
  }
});
