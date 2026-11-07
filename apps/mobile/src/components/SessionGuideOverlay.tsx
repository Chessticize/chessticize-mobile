import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  I18nManager,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent
} from "react-native";
import { makeStyles } from "../theme/index.ts";
import {
  DEFAULT_GUIDE_METRICS,
  guideCalloutMaxWidth,
  guideSafeFrame,
  placeGuideCallout,
  type GuideCalloutGeometry,
  type GuideInsets,
  type GuidePlacement,
  type GuideRect,
  type GuideSize
} from "./sessionGuideGeometry.ts";

export type SessionGuideOverlayProps = {
  canGoBack: boolean;
  detail: string;
  insets: GuideInsets;
  // Changes whenever the target may have moved (step, layout class, board size).
  measureKey: string;
  nextLabel: string;
  note?: string;
  preferred: readonly GuidePlacement[];
  stepNumber: number;
  stepTestID: string;
  targetRef: React.RefObject<View | null>;
  testID: string;
  title: string;
  totalSteps: number;
  onBack: () => void;
  onExit: () => void;
  onNext: () => void;
  // Asks the screen to scroll by this many points when the target sits outside
  // the safe frame, for example with very large text.
  onRequestScroll?: (deltaY: number) => void;
};

type Measurement = {
  callout: GuideSize;
  container: GuideSize;
  target: GuideRect;
};

type MeasurableView = View & {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

const POINTER_SIDE = Math.round(DEFAULT_GUIDE_METRICS.pointerReach * Math.SQRT2);
// Re-measure once more after late layout such as the board's first paint.
const SETTLE_MEASURE_DELAY_MS = 250;
const MAX_SCROLL_REQUESTS_PER_STEP = 2;

// The first-use guide overlay (#611): a dimmed scrim with a rounded cut-out
// around one measured target of the real session screen, and one callout whose
// Back · n of m · Next row sits in its normal layout flow. Placement comes from
// the pure `placeGuideCallout` function.
export function SessionGuideOverlay({
  canGoBack,
  detail,
  insets,
  measureKey,
  nextLabel,
  note,
  preferred,
  stepNumber,
  stepTestID,
  targetRef,
  testID,
  title,
  totalSteps,
  onBack,
  onExit,
  onNext,
  onRequestScroll
}: SessionGuideOverlayProps): React.JSX.Element {
  const styles = useStyles();
  const rootRef = useRef<View>(null);
  const calloutRef = useRef<View>(null);
  const [containerSize, setContainerSize] = useState<GuideSize | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const measureGenerationRef = useRef(0);
  const scrollRequestsRef = useRef({ count: 0, key: measureKey });
  const onRequestScrollRef = useRef(onRequestScroll);
  onRequestScrollRef.current = onRequestScroll;

  const measure = useCallback(() => {
    const root = rootRef.current as MeasurableView | null;
    const target = targetRef.current as MeasurableView | null;
    const callout = calloutRef.current as MeasurableView | null;
    if (
      typeof root?.measureInWindow !== "function"
      || typeof target?.measureInWindow !== "function"
      || typeof callout?.measureInWindow !== "function"
    ) {
      return;
    }
    const generation = measureGenerationRef.current + 1;
    measureGenerationRef.current = generation;
    root.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
      target.measureInWindow?.((targetX, targetY, targetWidth, targetHeight) => {
        callout.measureInWindow?.((_calloutX, _calloutY, calloutWidth, calloutHeight) => {
          if (generation !== measureGenerationRef.current) {
            return;
          }
          if (rootWidth <= 0 || rootHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
            return;
          }
          const next: Measurement = {
            callout: { height: calloutHeight, width: calloutWidth },
            container: { height: rootHeight, width: rootWidth },
            target: {
              height: targetHeight,
              width: targetWidth,
              x: targetX - rootX,
              y: targetY - rootY
            }
          };
          const safeFrame = guideSafeFrame(next.container, insets, 0);
          const deltaY = next.target.y < safeFrame.y
            ? next.target.y - safeFrame.y
            : next.target.y + next.target.height > safeFrame.y + safeFrame.height
              ? next.target.y + next.target.height - (safeFrame.y + safeFrame.height)
                + DEFAULT_GUIDE_METRICS.edgeMargin
              : 0;
          const requests = scrollRequestsRef.current;
          if (
            Math.abs(deltaY) > 1
            && onRequestScrollRef.current
            && requests.count < MAX_SCROLL_REQUESTS_PER_STEP
          ) {
            requests.count += 1;
            onRequestScrollRef.current(deltaY);
            setTimeout(() => measureRef.current(), 50);
          }
          setMeasurement((current) => sameMeasurement(current, next) ? current : next);
        });
      });
    });
  }, [insets, targetRef]);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useEffect(() => {
    if (scrollRequestsRef.current.key !== measureKey) {
      scrollRequestsRef.current = { count: 0, key: measureKey };
    }
    const frame = setTimeout(() => measureRef.current(), 16);
    const settle = setTimeout(() => measureRef.current(), SETTLE_MEASURE_DELAY_MS);
    return () => {
      clearTimeout(frame);
      clearTimeout(settle);
    };
  }, [measureKey, containerSize?.height, containerSize?.width]);

  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContainerSize((current) => current?.height === height && current.width === width
      ? current
      : { height, width });
  }, []);

  const container = containerSize ?? measurement?.container ?? null;
  const calloutWidth = container ? guideCalloutMaxWidth(container, insets) : undefined;
  const safeFrame = container ? guideSafeFrame(container, insets) : null;
  const geometry: GuideCalloutGeometry | null = measurement
    && container
    && measurement.container.width === container.width
    && measurement.container.height === container.height
    ? placeGuideCallout({
        callout: measurement.callout,
        container,
        insets,
        // The Jest host has no I18nManager; treat it as left-to-right.
        isRTL: I18nManager?.isRTL === true,
        maxCalloutWidth: calloutWidth,
        preferred,
        target: measurement.target
      })
    : null;
  // Show the callout once it has been measured at the width it is placed at.
  const isPlaced = geometry !== null
    && measurement !== null
    && Math.abs(geometry.callout.width - measurement.callout.width) < 1;
  const scrimPieces = geometry && container ? scrimPiecesFor(geometry.cutout, container) : null;

  return (
    <View
      accessibilityViewIsModal
      pointerEvents="box-none"
      ref={rootRef}
      style={styles.fill}
      testID={testID}
      onLayout={onRootLayout}
    >
      <View
        style={[styles.fill, styles.scrimFrame]}
        testID="practice-session-guide-scrim"
        onStartShouldSetResponder={() => true}
      >
        {scrimPieces ? (
          <>
            {scrimPieces.rects.map((rect, index) => (
              <View
                key={`rect-${index}`}
                pointerEvents="none"
                style={[styles.scrimRect, rect]}
              />
            ))}
            {scrimPieces.corners.map((corner, index) => (
              <View
                key={`corner-${index}`}
                pointerEvents="none"
                style={[styles.scrimCorner, corner.clip]}
              >
                <View style={[styles.scrimCornerRing, corner.ring]} />
              </View>
            ))}
            <View
              pointerEvents="none"
              style={[styles.scrimHole, scrimPieces.hole]}
              testID="practice-session-guide-cutout"
            />
          </>
        ) : (
          <View pointerEvents="none" style={[styles.fill, styles.scrimFill]} />
        )}
      </View>
      <View
        ref={calloutRef}
        style={[
          styles.callout,
          {
            left: geometry?.callout.x ?? safeFrame?.x ?? 0,
            maxHeight: safeFrame?.height,
            opacity: isPlaced ? 1 : 0,
            top: geometry?.callout.y ?? safeFrame?.y ?? 0,
            width: geometry?.callout.width ?? calloutWidth
          }
        ]}
        testID="practice-session-guide-callout"
        onLayout={() => measureRef.current()}
      >
        {geometry?.pointer ? (
          <View
            pointerEvents="none"
            style={[styles.pointer, pointerStyle(geometry.pointer)]}
            testID="practice-session-guide-pointer"
          />
        ) : null}
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title} testID="practice-session-guide-title">
            {title}
          </Text>
          <Pressable
            accessibilityLabel="Exit guide"
            accessibilityRole="button"
            hitSlop={11}
            style={styles.exitButton}
            testID="practice-session-guide-exit"
            onPress={onExit}
          >
            <View style={[styles.exitGlyphLine, styles.exitGlyphForward]} />
            <View style={[styles.exitGlyphLine, styles.exitGlyphBackward]} />
          </Pressable>
        </View>
        <ScrollView
          bounces={false}
          style={styles.copyScroll}
          contentContainerStyle={styles.copy}
          testID={stepTestID}
        >
          <Text style={styles.detail} testID="practice-session-guide-detail">{detail}</Text>
          {note ? (
            <Text style={styles.note} testID="practice-session-guide-note">{note}</Text>
          ) : null}
        </ScrollView>
        <View style={styles.navigation} testID="practice-session-guide-navigation">
          {canGoBack ? (
            <Pressable
              accessibilityLabel="Previous guide"
              accessibilityRole="button"
              style={styles.backButton}
              testID="practice-session-guide-back"
              onPress={onBack}
            >
              <Text numberOfLines={1} style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          <Text
            accessibilityLabel={`Guide ${stepNumber} of ${totalSteps}`}
            numberOfLines={1}
            style={styles.progress}
            testID="practice-session-guide-coach-progress"
          >
            {stepNumber} of {totalSteps}
          </Text>
          <Pressable
            accessibilityLabel={nextLabel}
            accessibilityRole="button"
            style={styles.nextButton}
            testID="practice-session-guide-start"
            onPress={onNext}
          >
            <Text numberOfLines={1} style={styles.nextText}>{nextLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function pointerStyle(
  pointer: NonNullable<GuideCalloutGeometry["pointer"]>
): object {
  const half = POINTER_SIDE / 2;
  // A square rotated 45 degrees, half inside the callout. Only the two edges
  // outside the callout carry its border, so it reads as one notch.
  switch (pointer.side) {
    case "top":
      return { borderLeftWidth: 1, borderTopWidth: 1, left: pointer.offset - half, top: -half - 1 };
    case "bottom":
      return {
        borderBottomWidth: 1,
        borderRightWidth: 1,
        bottom: -half - 1,
        left: pointer.offset - half
      };
    case "left":
      return { borderBottomWidth: 1, borderLeftWidth: 1, left: -half - 1, top: pointer.offset - half };
    case "right":
      return { borderRightWidth: 1, borderTopWidth: 1, right: -half - 1, top: pointer.offset - half };
  }
}

type ScrimBox = { height: number; left: number; top: number; width: number };

// The scrim is four plain rectangles around the cut-out's bounding box and, in
// each of its corners, a clipped square that dims everything outside the
// rounded corner. The pieces never overlap, so the scrim has one even tint.
// Very wide borders are not drawn reliably on iOS, so each corner uses a ring
// whose border is only as wide as the corner radius.
function scrimPiecesFor(
  cutout: GuideCalloutGeometry["cutout"],
  container: GuideSize
): {
  corners: { clip: ScrimBox; ring: ScrimBox & { borderRadius: number; borderWidth: number } }[];
  hole: ScrimBox;
  rects: ScrimBox[];
} {
  const left = cutout.x;
  const top = cutout.y;
  const right = cutout.x + cutout.width;
  const bottom = cutout.y + cutout.height;
  const span = (from: number, to: number): number => Math.max(0, to - from);
  const radius = Math.max(0, cutout.radius);
  // A ring of size 2r + 2b with border b and outer radius r + b has a circular
  // inner hole of radius r. Any b of at least 0.42r keeps the whole r-by-r
  // clip inside its outer edge, so only the quarter circle stays clear.
  const band = radius;
  const ring = {
    borderRadius: radius + band,
    borderWidth: band,
    height: 2 * (radius + band),
    width: 2 * (radius + band)
  };
  const corner = (clipLeft: number, clipTop: number, ringLeft: number, ringTop: number) => ({
    clip: { height: radius, left: clipLeft, top: clipTop, width: radius },
    ring: { ...ring, left: ringLeft, top: ringTop }
  });
  return {
    corners: radius > 0
      ? [
          corner(left, top, -band, -band),
          corner(right - radius, top, -radius - band, -band),
          corner(left, bottom - radius, -band, -radius - band),
          corner(right - radius, bottom - radius, -radius - band, -radius - band)
        ]
      : [],
    hole: { height: cutout.height, left, top, width: cutout.width },
    rects: [
      { height: Math.max(0, top), left: 0, top: 0, width: container.width },
      { height: span(bottom, container.height), left: 0, top: bottom, width: container.width },
      { height: span(top, bottom), left: 0, top, width: Math.max(0, left) },
      { height: span(top, bottom), left: right, top, width: span(right, container.width) }
    ]
  };
}

function sameMeasurement(current: Measurement | null, next: Measurement): boolean {
  return current !== null
    && current.callout.width === next.callout.width
    && current.callout.height === next.callout.height
    && current.container.width === next.container.width
    && current.container.height === next.container.height
    && current.target.x === next.target.x
    && current.target.y === next.target.y
    && current.target.width === next.target.width
    && current.target.height === next.target.height;
}

const useStyles = makeStyles((theme) => ({
  fill: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  scrimFrame: {
    overflow: "hidden"
  },
  scrimFill: {
    backgroundColor: theme.colors.scrim
  },
  scrimRect: {
    backgroundColor: theme.colors.scrim,
    position: "absolute"
  },
  scrimCorner: {
    overflow: "hidden",
    position: "absolute"
  },
  scrimCornerRing: {
    borderColor: theme.colors.scrim,
    position: "absolute"
  },
  scrimHole: {
    position: "absolute"
  },
  callout: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: DEFAULT_GUIDE_METRICS.calloutRadius,
    borderWidth: 1,
    gap: theme.space[10],
    paddingBottom: theme.space[12],
    paddingHorizontal: theme.space[16],
    paddingTop: theme.space[14],
    position: "absolute",
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16
  },
  pointer: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    height: POINTER_SIDE,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: POINTER_SIDE
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.space[8]
  },
  title: {
    color: theme.colors.text.heading,
    flex: 1,
    fontSize: theme.fontSize[17],
    fontWeight: theme.fontWeight.bold,
    lineHeight: 22
  },
  exitButton: {
    alignItems: "center",
    height: 22,
    justifyContent: "center",
    width: 22
  },
  exitGlyphLine: {
    backgroundColor: theme.colors.text.secondary,
    borderRadius: theme.radius.pill,
    height: 2,
    position: "absolute",
    width: 14
  },
  exitGlyphForward: {
    transform: [{ rotate: "45deg" }]
  },
  exitGlyphBackward: {
    transform: [{ rotate: "-45deg" }]
  },
  copyScroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  copy: {
    gap: theme.space[6]
  },
  detail: {
    color: theme.colors.text.primary,
    fontSize: theme.fontSize[15],
    lineHeight: 21
  },
  note: {
    color: theme.colors.text.secondary,
    fontSize: theme.fontSize[13],
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18
  },
  // When Back, progress and the start label cannot share one row (narrow
  // phones, large text), the action wraps to its own row instead of clipping.
  navigation: {
    alignItems: "center",
    columnGap: theme.space[8],
    flexDirection: "row",
    flexWrap: "wrap",
    minHeight: 44,
    rowGap: theme.space[8]
  },
  backButton: {
    alignItems: "center",
    flexShrink: 0,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[8],
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: theme.space[12]
  },
  backSpacer: {
    minWidth: 72
  },
  backText: {
    color: theme.colors.text.strong,
    fontSize: theme.fontSize[14],
    fontWeight: theme.fontWeight.bold
  },
  progress: {
    color: theme.colors.text.secondary,
    flexGrow: 1,
    flexShrink: 0,
    fontSize: theme.fontSize[13],
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center"
  },
  nextButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s600,
    flexShrink: 0,
    marginLeft: "auto",
    borderRadius: theme.radius[8],
    justifyContent: "center",
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: theme.space[14]
  },
  nextText: {
    color: theme.colors.text.onAccent,
    fontSize: theme.fontSize[14],
    fontWeight: theme.fontWeight.heavy
  }
}));
