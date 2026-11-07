import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  GroupedNativeIpadPage,
  GroupedNativePhonePage,
  GroupedNativeTokensPage
} from "./visualDirection/VisualDirectionPrototype.tsx";

// Issue #609 design reference for the chosen direction, A "Grouped Native". These
// render lab-only primitives, not the production app, so they opt out of the fixed
// device frame and fill the window. Story URLs are stable from the phase 1 preview.
const meta = {
  title: "Visual Direction",
  component: GroupedNativeTokensPage,
  parameters: {
    labDeviceChrome: false
  },
  globals: {
    viewport: { value: undefined, isRotated: false }
  }
} satisfies Meta<typeof GroupedNativeTokensPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AGroupedNativeTokens: Story = {
  name: "A Grouped Native Tokens"
};

export const AGroupedNativePhone: Story = {
  name: "A Grouped Native Phone",
  render: () => <GroupedNativePhonePage />
};

export const AGroupedNativeIpad: Story = {
  name: "A Grouped Native iPad",
  render: () => <GroupedNativeIpadPage />
};
