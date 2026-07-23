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
  regularWidth: {
    width: 1180,
    height: 820,
    insets: { top: 0, right: 0, bottom: 0, left: 0 }
  }
} as const satisfies Record<string, LabDeviceViewport>;

const deviceViewports = Object.values(LAB_DEVICE_VIEWPORTS);
const zeroInsets: LabSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

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
