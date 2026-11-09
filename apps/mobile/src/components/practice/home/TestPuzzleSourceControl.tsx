import React from "react";
import { Pressable, Text, View } from "react-native";
import type { SimulatedHistoryScenarioId } from "../../../../../../packages/storage/src/simulation/scenarios.ts";
import type { MobilePuzzleSource } from "../../../platform/mobilePractice.ts";
import { makeStyles } from "../../../theme/index.ts";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

export const SIMULATED_HISTORY_SCENARIOS: ReadonlyArray<{ scenario: SimulatedHistoryScenarioId; label: string }> = [
  { scenario: "slow-fork-speed", label: "Slow fork" },
  { scenario: "weak-fork-solve", label: "Weak fork" },
  { scenario: "balanced", label: "Balanced" },
  { scenario: "recently-recommended", label: "Recent" }
];

const TEST_PUZZLE_SOURCES: ReadonlyArray<{ source: MobilePuzzleSource; label: string }> = [
  { source: "bundledCore", label: "Core Pack" },
  { source: "familiar15", label: "Familiar 15" }
];

export function TestPuzzleSourceControl({
  source,
  onChange,
  onInjectMateIn2FocusedRun,
  onSeedTacticalHistory,
  seededHistoryStatus,
  simulationActive,
  onToggleSimulation,
  onClearSimulation,
  onShowWhatsNew,
  onSimulateWhatsNewUpdate
}: {
  source: MobilePuzzleSource;
  onChange: (next: MobilePuzzleSource) => void;
  onInjectMateIn2FocusedRun?: () => void;
  onSeedTacticalHistory?: (scenario: SimulatedHistoryScenarioId) => void;
  seededHistoryStatus?: string | null;
  simulationActive?: boolean;
  onToggleSimulation?: () => void;
  onClearSimulation?: () => void;
  onShowWhatsNew?: () => void;
  onSimulateWhatsNewUpdate?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.testPanel} testID="test-puzzle-source-control">
      {onToggleSimulation ? (
        <>
          <View style={styles.optionRow}>
            <OptionButton
              active={simulationActive === true}
              label="Use simulation data"
              testID="test-simulation-profile-toggle"
              onPress={onToggleSimulation}
            />
            {simulationActive && onClearSimulation ? (
              <OptionButton
                active={false}
                label="Clear simulation data"
                testID="test-simulation-profile-clear"
                onPress={onClearSimulation}
              />
            ) : null}
          </View>
          {simulationActive ? (
            <Text style={styles.simulationNotice} testID="test-simulation-profile-notice">
              Simulation data is on. Your Dev progress is untouched.
            </Text>
          ) : null}
        </>
      ) : null}
      <Text style={styles.helperText}>Test puzzle source</Text>
      <View style={styles.optionRow}>
        {TEST_PUZZLE_SOURCES.map((option) => (
          <OptionButton
            key={option.source}
            active={source === option.source}
            label={option.label}
            testID={`test-puzzle-source-${option.source}`}
            onPress={() => onChange(option.source)}
          />
        ))}
      </View>
      {onInjectMateIn2FocusedRun ? (
        <OptionButton
          active={false}
          label="Inject Mate in 2 Focused Run"
          testID="test-focused-run-inject-mate-in-2"
          onPress={onInjectMateIn2FocusedRun}
        />
      ) : null}
      {onSeedTacticalHistory ? (
        <>
          <Text style={styles.helperText}>Seed simulated history (Dev only)</Text>
          <View style={styles.optionRow}>
            {SIMULATED_HISTORY_SCENARIOS.map(({ scenario, label }) => (
              <OptionButton
                key={scenario}
                active={false}
                label={label}
                testID={`test-seed-tactical-history-${scenario}`}
                onPress={() => onSeedTacticalHistory(scenario)}
              />
            ))}
          </View>
        </>
      ) : null}
      {onShowWhatsNew || onSimulateWhatsNewUpdate ? (
        <>
          <Text style={styles.helperText}>What’s New (Dev only)</Text>
          <View style={styles.optionRow}>
            {onShowWhatsNew ? (
              <OptionButton
                active={false}
                label="Show What’s New"
                testID="test-whats-new-show"
                onPress={onShowWhatsNew}
              />
            ) : null}
            {onSimulateWhatsNewUpdate ? (
              <OptionButton
                active={false}
                label="Simulate update to 1.6.0"
                testID="test-whats-new-simulate-update"
                onPress={onSimulateWhatsNewUpdate}
              />
            ) : null}
          </View>
        </>
      ) : null}
      {seededHistoryStatus ? (
        <Text style={styles.helperText} testID="test-seed-tactical-history-status">
          {seededHistoryStatus}
        </Text>
      ) : null}
    </View>
  );
}

function OptionButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      testID={testID}
      style={[styles.optionButton, active ? styles.optionButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.optionButtonText, active ? styles.optionButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["helperText", "optionButton", "optionButtonActive", "optionButtonText", "optionButtonTextActive", "optionRow"]),
  testPanel: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  simulationNotice: {
    color: theme.colors.warning.s600,
    fontSize: 12,
    fontWeight: "600"
  },
}));
