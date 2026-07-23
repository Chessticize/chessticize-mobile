import React from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  PuzzleTimingDesignPrototype,
  type PuzzleTimingDesignPhase,
  type PuzzleTimingDesignScreen
} from "../../mobile/src/components/PuzzleTimingDesignPrototype.tsx";
import { LabScenarioShell } from "./LabScenario.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";

function TimingStory({
  phase,
  scenarioId,
  screen
}: {
  phase?: PuzzleTimingDesignPhase;
  scenarioId: LabScenarioId;
  screen: PuzzleTimingDesignScreen;
}): React.JSX.Element {
  return (
    <LabScenarioShell scenarioId={scenarioId}>
      <PuzzleTimingDesignPrototype phase={phase} screen={screen} />
    </LabScenarioShell>
  );
}

const meta = {
  title: "Practice/Timing",
  component: TimingStory
} satisfies Meta<typeof TimingStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RunPolicy: Story = {
  name: "Run policy",
  args: {
    scenarioId: "practice-timing-policy",
    screen: "policy"
  },
  tags: ["new"]
};

export const ActivePace: Story = {
  name: "Active pace",
  args: {
    phase: "normal",
    scenarioId: "practice-timing-active",
    screen: "active"
  },
  tags: ["new"]
};

export const SlowWarning: Story = {
  name: "Slow warning",
  args: {
    phase: "warning",
    scenarioId: "practice-timing-warning",
    screen: "active"
  },
  tags: ["new"]
};

export const PuzzleTimeout: Story = {
  name: "Puzzle timeout",
  args: {
    phase: "timeout",
    scenarioId: "practice-timing-timeout",
    screen: "active"
  },
  tags: ["new"]
};
