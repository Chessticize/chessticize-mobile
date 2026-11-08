import React from "react";
import type { Preview } from "@storybook/react-native-web-vite";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext
} from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../../mobile/src/components/PracticeViewport.tsx";
import { darkTheme, lightTheme, ThemeProvider } from "../../mobile/src/theme/index.ts";
import "../src/lab.css";
import { installLabIconFont } from "../src/labIconFont.ts";
import { themeWithTextScale } from "../src/labTextScale.ts";
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
  textScale = 1,
  themeGlobal
}: React.PropsWithChildren<{ textScale?: number; themeGlobal: unknown }>): React.JSX.Element {
  const labTheme = themeGlobal === "dark" ? "dark" : "light";
  React.useLayoutEffect(() => {
    document.documentElement.dataset.labTheme = labTheme;
  }, [labTheme]);

  return (
    <ThemeProvider theme={themeWithTextScale(labTheme === "dark" ? darkTheme : lightTheme, textScale)}>
      {children}
    </ThemeProvider>
  );
}

installLabIconFont();

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <LabThemeScope
        textScale={typeof context.parameters.labTextScale === "number" ? context.parameters.labTextScale : 1}
        themeGlobal={context.globals.theme}
      >
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
        order: ["00 What's New", "Practice", "Review", "History", "Settings", "Release Notes", "System", "Visual Direction", "Sprint Result redesign"]
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
        },
        splitViewHalf: {
          name: "iPad 13-inch Split View · half",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.splitViewHalf.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.splitViewHalf.height}px`
          },
          type: "tablet"
        },
        splitViewThird: {
          name: "iPad 13-inch Split View · one third",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.splitViewThird.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.splitViewThird.height}px`
          },
          type: "mobile"
        },
        stageManagerShort: {
          name: "iPad Stage Manager · short window",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.stageManagerShort.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.stageManagerShort.height}px`
          },
          type: "tablet"
        },
        duoInnerLandscape: {
          name: "iPhone Duo inner landscape",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.duoInnerLandscape.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.duoInnerLandscape.height}px`
          },
          type: "tablet"
        },
        duoInnerPortrait: {
          name: "iPhone Duo inner portrait",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.duoInnerPortrait.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.duoInnerPortrait.height}px`
          },
          type: "tablet"
        },
        duoSplitViewHalf: {
          name: "iPhone Duo inner Split View · half",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.duoSplitViewHalf.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.duoSplitViewHalf.height}px`
          },
          type: "mobile"
        },
        duoSplitViewThird: {
          name: "iPhone Duo inner Split View · one third",
          styles: {
            width: `${LAB_DEVICE_VIEWPORTS.duoSplitViewThird.width}px`,
            height: `${LAB_DEVICE_VIEWPORTS.duoSplitViewThird.height}px`
          },
          type: "mobile"
        }
      }
    }
  }
};

export default preview;
