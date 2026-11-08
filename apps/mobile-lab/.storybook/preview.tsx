import React from "react";
import type { Preview } from "@storybook/react-native-web-vite";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext
} from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../../mobile/src/components/PracticeViewport.tsx";
import { darkTheme, lightTheme, ThemeProvider } from "../../mobile/src/theme/index.ts";
import "../src/lab.css";
import { LabDeviceStatusBar } from "../src/LabDeviceStatusBar.tsx";
import {
  LAB_DEVICE_VIEWPORTS,
  labDeviceViewportForGlobal,
  labSafeAreaMetricsForViewport
} from "../src/labDeviceFrame.ts";

function LabDeviceFrame({
  children,
  showDeviceChrome,
  viewportGlobal
}: React.PropsWithChildren<{
  showDeviceChrome: boolean;
  viewportGlobal: unknown;
}>): React.JSX.Element {
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
      data-safe-area-top={metrics.insets.top}
      data-testid="lab-device-frame"
      style={{ height, minHeight: height, width }}
    >
      {showDeviceChrome ? (
        <LabDeviceStatusBar height={metrics.insets.top} width={width} />
      ) : null}
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

// Wraps a story in the selected Lab theme and mirrors it onto the document so
// lab.css can switch color-scheme and the fake device chrome.
function LabThemeScope({
  children,
  themeGlobal
}: React.PropsWithChildren<{ themeGlobal: unknown }>): React.JSX.Element {
  const labTheme = themeGlobal === "dark" ? "dark" : "light";
  React.useLayoutEffect(() => {
    document.documentElement.dataset.labTheme = labTheme;
  }, [labTheme]);

  return (
    <ThemeProvider theme={labTheme === "dark" ? darkTheme : lightTheme}>
      {children}
    </ThemeProvider>
  );
}

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <LabThemeScope themeGlobal={context.globals.theme}>
        <Story />
      </LabThemeScope>
    ),
    (Story, context) => (
      <LabDeviceFrame
        showDeviceChrome={context.parameters.labDeviceChrome !== false}
        viewportGlobal={context.globals.viewport}
      >
        <Story />
      </LabDeviceFrame>
    )
  ],
  globalTypes: {
    theme: {
      description: "Interaction Lab theme",
      toolbar: {
        dynamicTitle: true,
        icon: "circlehollow",
        items: [
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" }
        ],
        title: "Theme"
      }
    }
  },
  initialGlobals: {
    theme: "light",
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
        order: ["00 What's New", "Practice", "Review", "History", "Settings", "System", "Visual Direction"]
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
