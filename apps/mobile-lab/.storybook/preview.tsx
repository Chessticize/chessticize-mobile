import React from "react";
import type { Preview } from "@storybook/react-native-web-vite";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext
} from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../../mobile/src/components/PracticeViewport.tsx";
import "../src/lab.css";
import {
  LAB_DEVICE_VIEWPORTS,
  labDeviceViewportForGlobal,
  labSafeAreaMetricsForViewport
} from "../src/labDeviceFrame.ts";

function LabDeviceFrame({
  children,
  viewportGlobal
}: React.PropsWithChildren<{ viewportGlobal: unknown }>): React.JSX.Element {
  const selectedViewport = labDeviceViewportForGlobal(
    viewportGlobal as Parameters<typeof labDeviceViewportForGlobal>[0]
  );
  if (selectedViewport === null) {
    return <>{children}</>;
  }

  const { height, width } = selectedViewport;
  const metrics = labSafeAreaMetricsForViewport(width, height);

  return (
    <div
      className="lab-device-frame"
      data-testid="lab-device-frame"
      style={{ height, minHeight: height, width }}
    >
      <PracticeViewportProvider value={{ height, width }}>
        <SafeAreaFrameContext.Provider value={metrics.frame}>
          <SafeAreaInsetsContext.Provider value={metrics.insets}>
            {children}
          </SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
      </PracticeViewportProvider>
    </div>
  );
}

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <LabDeviceFrame viewportGlobal={context.globals.viewport}>
        <Story />
      </LabDeviceFrame>
    )
  ],
  initialGlobals: {
    viewport: {
      value: "phonePortrait",
      isRotated: false
    }
  },
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
        tabletPortrait: {
          name: "iPad portrait · Release",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.tabletPortrait.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.tabletPortrait.height}px`
          },
          type: "tablet"
        },
        regularWidth: {
          name: "iPad landscape · Release",
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
