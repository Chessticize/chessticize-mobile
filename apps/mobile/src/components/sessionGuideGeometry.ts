// Pure placement for the first-use session guide overlay (#611).
//
// The overlay dims the real session screen, cuts a rounded hole around one
// measured target, and places a single callout next to that hole. Every value
// here derives from measured frames and the Safe Area; there are no per-step or
// per-device offsets.

export type GuideRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type GuideSize = {
  height: number;
  width: number;
};

export type GuideInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

// Leading and trailing follow the layout direction, so they flip in RTL.
export type GuidePlacement = "above" | "below" | "leading" | "trailing";

export type GuidePointerSide = "bottom" | "left" | "right" | "top";

export type GuideCalloutGeometryInput = {
  // Size of the overlay, which covers the whole window.
  container: GuideSize;
  // Safe Area insets of that window. Each edge is applied on its own because
  // some displays reserve only one side (the iPhone Duo outer display reserves
  // a status-bar column on the right).
  insets: GuideInsets;
  // Measured target, in overlay coordinates.
  target: GuideRect;
  // Measured callout size. A taller callout is clamped to the safe frame.
  callout: GuideSize;
  // Widest callout to use (`guideCalloutMaxWidth`). Beside a target the
  // callout may narrow to the space there, down to `minCalloutWidth`; its
  // height at another width is estimated from the measured area until the
  // overlay re-measures it at the returned width. Defaults to the measured
  // width, which disables narrowing.
  maxCalloutWidth?: number;
  // Preferred placements, tried in order before the remaining ones.
  preferred?: readonly GuidePlacement[];
  isRTL?: boolean;
  metrics?: Partial<GuideMetrics>;
};

export type GuideMetrics = {
  // Space kept between the callout and each Safe Area edge.
  edgeMargin: number;
  // Distance from the cut-out edge to the callout edge. The pointer sits in it.
  gap: number;
  // Extra space drawn around the target by the cut-out.
  cutoutPadding: number;
  cutoutRadius: number;
  // How far the pointer reaches out of the callout edge.
  pointerReach: number;
  // Corner radius of the callout; the pointer never sits on a rounded corner.
  calloutRadius: number;
  // Narrowest callout used beside a target.
  minCalloutWidth: number;
};

export type GuideCalloutGeometry = {
  callout: GuideRect;
  cutout: GuideRect & { radius: number };
  // True when no side of the target had room, so the callout was clamped over
  // part of the cut-out and the pointer is hidden.
  overlapsTarget: boolean;
  placement: GuidePlacement;
  // Pointer anchor in callout coordinates: the centre of the pointer's base on
  // the callout edge that faces the target.
  pointer: { offset: number; side: GuidePointerSide } | null;
  safeFrame: GuideRect;
};

export const DEFAULT_GUIDE_METRICS: GuideMetrics = {
  calloutRadius: 14,
  cutoutPadding: 6,
  cutoutRadius: 12,
  edgeMargin: 12,
  gap: 14,
  minCalloutWidth: 240,
  pointerReach: 8
};

export const GUIDE_CALLOUT_MAX_WIDTH = 360;

const DEFAULT_PLACEMENT_ORDER: readonly GuidePlacement[] = [
  "below",
  "above",
  "trailing",
  "leading"
];

export function guideSafeFrame(
  container: GuideSize,
  insets: GuideInsets,
  edgeMargin = DEFAULT_GUIDE_METRICS.edgeMargin
): GuideRect {
  const x = insets.left + edgeMargin;
  const y = insets.top + edgeMargin;
  return {
    height: Math.max(0, container.height - insets.bottom - edgeMargin - y),
    width: Math.max(0, container.width - insets.right - edgeMargin - x),
    x,
    y
  };
}

// The callout is laid out at this width, so its measured height already
// reflects the text wrapping the guide will show.
export function guideCalloutMaxWidth(
  container: GuideSize,
  insets: GuideInsets,
  edgeMargin = DEFAULT_GUIDE_METRICS.edgeMargin
): number {
  return Math.min(
    GUIDE_CALLOUT_MAX_WIDTH,
    guideSafeFrame(container, insets, edgeMargin).width
  );
}

export function placeGuideCallout(
  input: GuideCalloutGeometryInput
): GuideCalloutGeometry {
  const metrics = { ...DEFAULT_GUIDE_METRICS, ...input.metrics };
  const safeFrame = guideSafeFrame(input.container, input.insets, metrics.edgeMargin);
  const cutout = cutoutFor(input.target, input.container, metrics);
  const maxWidth = Math.min(
    input.maxCalloutWidth ?? input.callout.width,
    safeFrame.width
  );
  const minWidth = Math.min(metrics.minCalloutWidth, maxWidth);
  const measuredArea = input.callout.width * input.callout.height;
  const sizeAt = (width: number): GuideSize => ({
    height: Math.min(
      width === input.callout.width
        ? input.callout.height
        : Math.ceil(measuredArea / Math.max(1, width)),
      safeFrame.height
    ),
    width
  });
  const order = placementOrder(input.preferred);
  const candidates = order.map((placement) => {
    const space = availableSpace(placement, cutout, safeFrame, metrics.gap, input.isRTL === true);
    const size = isVertical(placement)
      ? sizeAt(maxWidth)
      : sizeAt(Math.max(minWidth, Math.min(maxWidth, Math.floor(space))));
    return {
      fits: isVertical(placement)
        ? space >= size.height
        : space >= size.width && size.height <= safeFrame.height,
      placement,
      size,
      space
    };
  });
  const fitting = candidates.find((candidate) => candidate.fits);
  const chosen = fitting ?? candidates
    // With no room on any side, keep the callout above or below the target
    // where the most of it fits, and let the clamp cover part of the cut-out.
    .filter(({ placement }) => isVertical(placement))
    .reduce((best, candidate) => candidate.space > best.space ? candidate : best);
  const placement = chosen.placement;
  const { height, width } = chosen.size;
  const physicalSide = physicalPlacement(placement, input.isRTL === true);
  const cutoutCenterX = cutout.x + cutout.width / 2;
  const cutoutCenterY = cutout.y + cutout.height / 2;

  let x: number;
  let y: number;
  switch (physicalSide) {
    case "above":
      x = cutoutCenterX - width / 2;
      y = cutout.y - metrics.gap - height;
      break;
    case "below":
      x = cutoutCenterX - width / 2;
      y = cutout.y + cutout.height + metrics.gap;
      break;
    case "left":
      x = cutout.x - metrics.gap - width;
      y = cutoutCenterY - height / 2;
      break;
    case "right":
      x = cutout.x + cutout.width + metrics.gap;
      y = cutoutCenterY - height / 2;
      break;
  }
  x = clamp(x, safeFrame.x, safeFrame.x + safeFrame.width - width);
  y = clamp(y, safeFrame.y, safeFrame.y + safeFrame.height - height);
  const callout = { height, width, x, y };
  const overlapsTarget = fitting === undefined && rectsOverlap(callout, cutout);

  return {
    callout,
    cutout,
    overlapsTarget,
    placement,
    pointer: overlapsTarget
      ? null
      : pointerFor(physicalSide, callout, cutoutCenterX, cutoutCenterY, metrics),
    safeFrame
  };
}

function cutoutFor(
  target: GuideRect,
  container: GuideSize,
  metrics: GuideMetrics
): GuideRect & { radius: number } {
  const left = clamp(target.x - metrics.cutoutPadding, 0, container.width);
  const top = clamp(target.y - metrics.cutoutPadding, 0, container.height);
  const right = clamp(target.x + target.width + metrics.cutoutPadding, left, container.width);
  const bottom = clamp(target.y + target.height + metrics.cutoutPadding, top, container.height);
  const width = right - left;
  const height = bottom - top;
  return {
    height,
    radius: Math.min(metrics.cutoutRadius, width / 2, height / 2),
    width,
    x: left,
    y: top
  };
}

function placementOrder(
  preferred: readonly GuidePlacement[] | undefined
): GuidePlacement[] {
  const order: GuidePlacement[] = [];
  for (const placement of [...(preferred ?? []), ...DEFAULT_PLACEMENT_ORDER]) {
    if (!order.includes(placement)) {
      order.push(placement);
    }
  }
  return order;
}

function availableSpace(
  placement: GuidePlacement,
  cutout: GuideRect,
  safeFrame: GuideRect,
  gap: number,
  isRTL: boolean
): number {
  switch (physicalPlacement(placement, isRTL)) {
    case "above":
      return cutout.y - gap - safeFrame.y;
    case "below":
      return safeFrame.y + safeFrame.height - (cutout.y + cutout.height + gap);
    case "left":
      return cutout.x - gap - safeFrame.x;
    case "right":
      return safeFrame.x + safeFrame.width - (cutout.x + cutout.width + gap);
  }
}

function physicalPlacement(
  placement: GuidePlacement,
  isRTL: boolean
): "above" | "below" | "left" | "right" {
  if (placement === "leading") {
    return isRTL ? "right" : "left";
  }
  if (placement === "trailing") {
    return isRTL ? "left" : "right";
  }
  return placement;
}

function pointerFor(
  side: "above" | "below" | "left" | "right",
  callout: GuideRect,
  cutoutCenterX: number,
  cutoutCenterY: number,
  metrics: GuideMetrics
): GuideCalloutGeometry["pointer"] {
  // Keep the pointer base clear of the callout's rounded corners.
  const inset = metrics.calloutRadius + metrics.pointerReach;
  if (side === "above" || side === "below") {
    if (callout.width < inset * 2) {
      return null;
    }
    return {
      offset: clamp(cutoutCenterX - callout.x, inset, callout.width - inset),
      side: side === "above" ? "bottom" : "top"
    };
  }
  if (callout.height < inset * 2) {
    return null;
  }
  return {
    offset: clamp(cutoutCenterY - callout.y, inset, callout.height - inset),
    side: side === "left" ? "right" : "left"
  };
}

function isVertical(placement: GuidePlacement): boolean {
  return placement === "above" || placement === "below";
}

function rectsOverlap(a: GuideRect, b: GuideRect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
