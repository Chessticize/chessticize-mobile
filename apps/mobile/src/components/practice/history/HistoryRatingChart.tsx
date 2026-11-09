import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  formatLocalCalendarDate,
  type HistoryPerformance,
  type HistoryPerformancePoint
} from "../../../../../../packages/core/src/index.ts";
import { ratingLabelFromKey } from "../settings/SettingsPanel.tsx";
import { makeStyles } from "../../../theme/index.ts";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

// Cap the rendered points so long ranges stay smooth without stacking
// hundreds of segment Views; downsampling always keeps first and last.
const HISTORY_LINE_CHART_MAX_POINTS = 64;

// Individual dots read as noise once the line is dense; past this count only
// the latest-rating dot is drawn.
// Vertical band used by the plot inside the 60px line layer: value min maps
// to y=48, value max to y=6 (48 - 42).
const HISTORY_LINE_CHART_BASE_Y = 48;

const HISTORY_LINE_CHART_PLOT_HEIGHT = 42;

const HISTORY_LINE_CHART_LAYER_HEIGHT = 60;

const HISTORY_LINE_TOOLTIP_WIDTH = 104;

const HISTORY_LINE_TOOLTIP_HEIGHT = 42;

const HISTORY_LINE_TOOLTIP_GAP = 8;

function downsampleHistoryRatingPoints(
  points: Array<{ key: string; value: number }>,
  maxPoints: number
): Array<{ key: string; value: number }> {
  if (points.length <= maxPoints) {
    return points;
  }
  const lastIndex = points.length - 1;
  const sampled: Array<{ key: string; value: number }> = [];
  let previousIndex = -1;
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * lastIndex) / (maxPoints - 1));
    if (index !== previousIndex) {
      sampled.push(points[index]);
      previousIndex = index;
    }
  }
  return sampled;
}

export function HistoryRatingTrendChart({
  points
}: {
  points: HistoryPerformancePoint[];
}): React.JSX.Element {
  const styles = useStyles();
  const displayed = downsampleHistoryRatingPoints(points, HISTORY_LINE_CHART_MAX_POINTS);
  if (displayed.length === 0) {
    return (
      <View style={styles.historyChartEmpty} testID="history-performance-chart">
        <Text style={styles.helperText}>No rating data in this range.</Text>
      </View>
    );
  }
  return <HistoryRatingLineChart points={displayed} />;
}

function HistoryRatingLineChart({
  points
}: {
  points: HistoryPerformancePoint[];
}): React.JSX.Element {
  const styles = useStyles();
  // Segment geometry needs the layer's pixel width: percent-based math mixed
  // px rise with % run, which rendered detached segments at wrong angles.
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrubberX, setScrubberX] = useState<number | null>(null);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const stepPx = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const pointY = (value: number) =>
    HISTORY_LINE_CHART_BASE_Y - ((value - min) / span) * HISTORY_LINE_CHART_PLOT_HEIGHT;
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const selectedPointLabel = selectedPoint ? historyRatingPointLabel(selectedPoint) : null;
  const selectedX = selectedIndex === null
    ? 0
    : points.length > 1
      ? selectedIndex * stepPx
      : plotWidth / 2;
  const activeX = scrubberX ?? selectedX;
  const tooltipLeft = selectedPoint
    ? activeX > plotWidth / 2
      ? Math.max(0, activeX - HISTORY_LINE_TOOLTIP_WIDTH - HISTORY_LINE_TOOLTIP_GAP)
      : Math.min(
          Math.max(0, plotWidth - HISTORY_LINE_TOOLTIP_WIDTH),
          activeX + HISTORY_LINE_TOOLTIP_GAP
        )
    : 0;
  const tooltipTop = selectedPoint
    ? Math.max(
        0,
        Math.min(
          HISTORY_LINE_CHART_LAYER_HEIGHT - HISTORY_LINE_TOOLTIP_HEIGHT,
          pointY(selectedPoint.value) - HISTORY_LINE_TOOLTIP_HEIGHT / 2
        )
      )
    : 0;
  const smoothedPoints = plotWidth > 0
    ? smoothHistoryRatingPoints(points.map((point, index) => ({ x: index * stepPx, y: pointY(point.value) })))
    : [];

  const selectNearestPoint = (locationX: number): void => {
    if (plotWidth <= 0) {
      return;
    }
    const nextScrubberX = Math.max(0, Math.min(plotWidth, locationX));
    const ratio = nextScrubberX / plotWidth;
    setScrubberX(nextScrubberX);
    setSelectedIndex(points.length === 1 ? 0 : Math.round(ratio * (points.length - 1)));
  };

  const clearSelection = (): void => {
    setSelectedIndex(null);
    setScrubberX(null);
  };

  return (
    <View style={styles.historyLineChart} testID="history-performance-chart">
      <View style={styles.historyLineGrid} />
      <View style={[styles.historyLineGrid, styles.historyLineGridMiddle]} />
      <View style={[styles.historyLineGrid, styles.historyLineGridBottom]} />
      <View
        style={styles.historyLineLayer}
        testID="history-chart-line"
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={selectedPointLabel ?? "Rating trend. Drag across the chart to inspect dates and ratings."}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => selectNearestPoint(event.nativeEvent.locationX)}
        onResponderMove={(event) => selectNearestPoint(event.nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
        onResponderRelease={clearSelection}
        onResponderTerminate={clearSelection}
      >
        {smoothedPoints.slice(0, -1).map((point, index) => {
              const next = smoothedPoints[index + 1] ?? point;
              const x1 = point.x;
              const x2 = next.x;
              const y1 = point.y;
              const y2 = next.y;
              const length = Math.hypot(x2 - x1, y2 - y1);
              const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
              // RN rotates around the view's center, so center the segment on
              // the midpoint of its two data points; endpoints then land on
              // the dots exactly.
              return (
                <View
                  key={`curve-${index}`}
                  style={[
                    styles.historyLineSegment,
                    {
                      left: (x1 + x2) / 2 - length / 2,
                      top: (y1 + y2) / 2 - 1,
                      transform: [{ rotate: `${angle}deg` }],
                      width: length
                    }
                  ]}
                  testID={`history-chart-line-segment-${index}`}
                />
              );
            })}
        {selectedPoint ? (
          <>
            <View style={[styles.historyLineSelectionGuide, { left: activeX }]} testID="history-chart-selection-guide" />
            <View
              style={[styles.historyLineSelectionPoint, { left: selectedX, top: pointY(selectedPoint.value) }]}
              testID="history-chart-selection-point"
            />
            <View
              style={[
                styles.historyLineTooltip,
                { left: tooltipLeft, top: tooltipTop }
              ]}
              pointerEvents="none"
              testID="history-chart-tooltip"
            >
              <Text style={styles.historyLineTooltipRating}>Rating {selectedPoint.value}</Text>
              <Text style={styles.historyLineTooltipDate}>
                {selectedPoint.completedAt ? formatLocalCalendarDate(selectedPoint.completedAt) : formatHistoryRatingDate(selectedPoint.key)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function smoothHistoryRatingPoints(
  points: Array<{ x: number; y: number }>,
  samplesPerSegment = 6
): Array<{ x: number; y: number }> {
  if (points.length < 3) {
    return points;
  }
  const smoothed: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      smoothed.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: 0.5 * (
          2 * p1.y
          + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        )
      });
    }
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function formatHistoryRatingDate(key: string): string {
  const embeddedIsoDate = key.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/)?.[0];
  const parsed = new Date(embeddedIsoDate ?? (key.includes("T") ? key : `${key}T12:00:00`));
  if (!Number.isFinite(parsed.getTime())) {
    return key;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function historyRatingPointLabel(point: HistoryPerformancePoint): string {
  const dateLabel = point.completedAt ? formatLocalCalendarDate(point.completedAt) : formatHistoryRatingDate(point.key);
  return `${dateLabel} · Rating ${point.value}`;
}

export function emptyHistoryPerformance(): HistoryPerformance {
  return {
    correctCount: 0,
    wrongCount: 0,
    accuracyPercent: 0,
    charts: {
      rating: [],
      "wins-losses": [],
      accuracy: [],
      solved: [],
      "mistake-rate": [],
      "review-due": []
    }
  };
}

export function historyRatingKeyLabel(
  ratingKey: string,
  runName?: string,
  runPerPuzzleSeconds?: number
): string {
  const speed = runPerPuzzleSeconds ?? Number(ratingKey.match(/\/(\d+)\b/)?.[1]);
  const speedLabel = speed ? ` · ${speed}s pace` : "";
  return `${runName ?? ratingLabelFromKey(ratingKey)}${speedLabel}`;
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["helperText"]),
  historyChartEmpty: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 58,
    padding: 10
  },
  historyLineChart: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: "relative"
  },
  historyLineGrid: {
    backgroundColor: theme.colors.surfaceStrong,
    height: StyleSheet.hairlineWidth,
    left: 12,
    opacity: 0.75,
    position: "absolute",
    right: 12,
    top: 16
  },
  historyLineGridMiddle: {
    top: 38
  },
  historyLineGridBottom: {
    top: 60
  },
  historyLineLayer: {
    bottom: 8,
    left: 18,
    position: "absolute",
    right: 18,
    top: 8
  },
  historyLineSegment: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 999,
    height: 2,
    opacity: 0.82,
    position: "absolute"
  },
  historyLineSelectionGuide: {
    backgroundColor: theme.colors.accent.s300,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth
  },
  historyLineSelectionPoint: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    position: "absolute",
    width: 10
  },
  historyLineTooltip: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: 7,
    minHeight: HISTORY_LINE_TOOLTIP_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    width: HISTORY_LINE_TOOLTIP_WIDTH
  },
  historyLineTooltipRating: {
    color: theme.colors.text.onTone,
    fontSize: 12,
    fontWeight: "800"
  },
  historyLineTooltipDate: {
    color: theme.colors.fillMuted,
    fontSize: 9,
    fontWeight: "600"
  },
}));
