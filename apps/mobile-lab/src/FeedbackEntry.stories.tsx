import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { FeedbackEntryPrototype } from "./FeedbackEntryPrototype.tsx";
import { waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "Settings",
  component: FeedbackEntryPrototype
} satisfies Meta<typeof FeedbackEntryPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeedbackEntryDesign: Story = {
  name: "Feedback entry design",
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "feedback-entry-prototype");
    await waitForTestId(canvasElement, "feedback-open-github");
  }
};
