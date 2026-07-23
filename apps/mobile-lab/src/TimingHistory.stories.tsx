import React from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  PuzzleTimingDesignPrototype,
  type PuzzleTimingDesignScreen
} from "../../mobile/src/components/PuzzleTimingDesignPrototype.tsx";
import { LabScenarioShell } from "./LabScenario.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";

function TimingHistoryStory({
  scenarioId,
  screen
}: {
  scenarioId: LabScenarioId;
  screen: PuzzleTimingDesignScreen;
}): React.JSX.Element {
  return (
    <LabScenarioShell scenarioId={scenarioId}>
      <PuzzleTimingDesignPrototype screen={screen} />
    </LabScenarioShell>
  );
}

const meta = {
  title: "History/Timing",
  component: TimingHistoryStory
} satisfies Meta<typeof TimingHistoryStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AttentionHistory: Story = {
  name: "Attention history",
  args: {
    scenarioId: "history-timing-attention",
    screen: "history"
  },
  tags: ["new"]
};

export const TacticalProfile: Story = {
  name: "Tactical profile",
  args: {
    scenarioId: "history-tactical-profile",
    screen: "profile"
  },
  tags: ["new"]
};
