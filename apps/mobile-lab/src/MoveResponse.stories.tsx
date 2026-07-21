import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { MoveResponsePrototype } from "./MoveResponsePrototype.tsx";

const meta = {
  title: "Practice/Move response contract",
  component: MoveResponsePrototype
} satisfies Meta<typeof MoveResponsePrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prototype: Story = {
  name: "Prototype · #246 + #247",
  tags: ["new"]
};
