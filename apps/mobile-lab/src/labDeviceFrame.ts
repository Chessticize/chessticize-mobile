export type LabSafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type LabDeviceViewport = {
  width: number;
  height: number;
  insets: LabSafeAreaInsets;
};

export const LAB_DEVICE_VIEWPORTS = {
  compactPhone: {
    width: 320,
    height: 693,
    insets: { top: 47, right: 0, bottom: 34, left: 0 }
  },
  phonePortrait: {
    width: 402,
    height: 874,
    insets: { top: 62, right: 0, bottom: 34, left: 0 }
  },
  largePhone: {
    width: 430,
    height: 932,
    insets: { top: 59, right: 0, bottom: 34, left: 0 }
  },
  phoneLandscape: {
    width: 874,
    height: 402,
    insets: { top: 0, right: 62, bottom: 21, left: 62 }
  },
  tabletPortrait: {
    width: 820,
    height: 1180,
    insets: { top: 24, right: 0, bottom: 20, left: 0 }
  },
  regularWidth: {
    width: 1180,
    height: 820,
    insets: { top: 0, right: 0, bottom: 20, left: 0 }
  }
} as const satisfies Record<string, LabDeviceViewport>;

const deviceViewports = Object.values(LAB_DEVICE_VIEWPORTS);
const zeroInsets: LabSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type StorybookViewportGlobal = string | {
  value?: string;
  isRotated?: boolean;
};

export function labDeviceViewportForGlobal(
  viewportGlobal: StorybookViewportGlobal | undefined
): LabDeviceViewport | null {
  const viewportKey = typeof viewportGlobal === "string"
    ? viewportGlobal
    : viewportGlobal?.value;
  if (!viewportKey || !(viewportKey in LAB_DEVICE_VIEWPORTS)) {
    return null;
  }

  const selected = LAB_DEVICE_VIEWPORTS[
    viewportKey as keyof typeof LAB_DEVICE_VIEWPORTS
  ];
  const isRotated = typeof viewportGlobal !== "string"
    && viewportGlobal?.isRotated === true;
  if (!isRotated) {
    return selected;
  }

  const matchingOrientation = deviceViewports.find((candidate) => (
    candidate.width === selected.height && candidate.height === selected.width
  ));
  if (matchingOrientation) {
    return matchingOrientation;
  }

  return {
    width: selected.height,
    height: selected.width,
    insets: {
      top: selected.insets.left,
      right: selected.insets.top,
      bottom: selected.insets.right,
      left: selected.insets.bottom
    }
  };
}

export function labSafeAreaMetricsForViewport(width: number, height: number): {
  frame: { x: number; y: number; width: number; height: number };
  insets: LabSafeAreaInsets;
} {
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);
  const profile = deviceViewports.find((candidate) => (
    candidate.width === roundedWidth && candidate.height === roundedHeight
  ));

  return {
    frame: { x: 0, y: 0, width, height },
    insets: { ...(profile?.insets ?? zeroInsets) }
  };
}
