import React from "react";
import type { Preview } from "@storybook/react-native-web-vite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../src/lab.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <SafeAreaProvider>
        <Story />
      </SafeAreaProvider>
    )
  ],
  parameters: {
    controls: {
      expanded: true
    },
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["00 What's New", "Practice", "Review", "History", "Settings", "System"]
      }
    },
    viewport: {
      defaultViewport: "phonePortrait",
      options: {
        compactPhone: {
          name: "Compact phone",
          styles: { width: "320px", height: "693px" },
          type: "mobile"
        },
        phonePortrait: {
          name: "Phone portrait",
          styles: { width: "390px", height: "844px" },
          type: "mobile"
        },
        largePhone: {
          name: "Large phone",
          styles: { width: "430px", height: "932px" },
          type: "mobile"
        },
        phoneLandscape: {
          name: "Phone landscape",
          styles: { width: "844px", height: "390px" },
          type: "mobile"
        },
        regularWidth: {
          name: "Regular width",
          styles: { width: "1180px", height: "820px" },
          type: "desktop"
        }
      }
    }
  }
};

export default preview;
