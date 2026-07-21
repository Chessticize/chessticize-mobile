import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { MultiThemeChoicePrototype } from "../../mobile/src/components/MultiThemeChoicePrototype.tsx";
import { LabScenarioShell } from "./LabScenario.tsx";

const SCENARIO_ID = "practice-multi-theme-choice" as const;

function MultiThemeChoiceLab(): React.JSX.Element {
  return (
    <LabScenarioShell scenarioId={SCENARIO_ID}>
      <div className="multi-theme-lab-stage">
        <MultiThemeChoicePrototype />
      </div>
    </LabScenarioShell>
  );
}

const meta = {
  title: "Practice/Theme Selection",
  component: MultiThemeChoiceLab
} satisfies Meta<typeof MultiThemeChoiceLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleThemeChoice: Story = {
  name: "Multiple theme choice"
};
