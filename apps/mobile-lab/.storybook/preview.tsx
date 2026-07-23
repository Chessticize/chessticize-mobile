import React from "react";
import type { Preview } from "@storybook/react-native-web-vite";
import { useWindowDimensions } from "react-native";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext
} from "react-native-safe-area-context";
import "../src/lab.css";
import {
  LAB_DEVICE_VIEWPORTS,
  labSafeAreaMetricsForViewport
} from "../src/labDeviceFrame.ts";

function LabDeviceFrame({ children }: React.PropsWithChildren): React.JSX.Element {
  const { height, width } = useWindowDimensions();
  const metrics = labSafeAreaMetricsForViewport(width, height);

  return (
    <SafeAreaFrameContext.Provider value={metrics.frame}>
      <SafeAreaInsetsContext.Provider value={metrics.insets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <LabDeviceFrame>
        <Story />
      </LabDeviceFrame>
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
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.compactPhone.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.compactPhone.height}px`
          },
          type: "mobile"
        },
        phonePortrait: {
          name: "Phone portrait · iPhone 17 Release",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.phonePortrait.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.phonePortrait.height}px`
          },
          type: "mobile"
        },
        largePhone: {
          name: "Large phone",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.largePhone.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.largePhone.height}px`
          },
          type: "mobile"
        },
        phoneLandscape: {
          name: "Phone landscape · iPhone 17 Release",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.phoneLandscape.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.phoneLandscape.height}px`
          },
          type: "mobile"
        },
        regularWidth: {
          name: "Regular width",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.regularWidth.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.regularWidth.height}px`
          },
          type: "desktop"
        }
      }
    }
  }
};

export default preview;
