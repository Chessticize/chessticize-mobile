import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { SprintAttentionPrototype } from "./SprintAttentionPrototype.tsx";
import { waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "Practice/Sprint attention prototype",
  component: SprintAttentionPrototype,
  tags: ["new"]
} satisfies Meta<typeof SprintAttentionPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TruthfulOutcomes: Story = {
  name: "Truthful outcomes",
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "sprint-attention-prototype");
  }
};
