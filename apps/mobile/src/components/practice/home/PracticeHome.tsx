import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { defaultSprintConfig, type SprintConfig, type SprintMode, type SprintState } from "../../../../../../packages/core/src/index.ts";
import type { AdaptiveLayout } from "../../adaptivePracticeLayout.ts";
import { usePracticeViewport } from "../../PracticeViewport.tsx";
import { HEADLINE_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE } from "../../../theme/scales.ts";
import {
  type PersonalBestChallengeDesignPreview,
  PersonalBestHomeCard,
  type PersonalBestPausedRunPresentation
} from "../../PersonalBestChallengeDesign.tsx";
import type { PracticeProgressSummary } from "../../../../../../packages/storage/src/rating-history.ts";
import type { PracticeRunManagementPresentation, PracticeRunPresentation } from "../../practiceRunPresentation.ts";
import type { TacticalProfilePresentation } from "../../tacticalProfilePresentation.ts";
import { formatSprintTimingLabel, modeLabel, safeTestId } from "../shared/practiceUtils.ts";
import { PracticeProgressCard } from "../shared/PracticeProgressCard.tsx";
import { TacticalProfileHomeCard } from "../../TacticalProfileSection.tsx";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { AppText, Button, Icon, type IconName, IconTile, ListRow, Section } from "../../ui/index.tsx";
import { RunRemovalConfirmation } from "../runEditor/PracticeRunEditor.tsx";
import { customThemeLabel } from "../shared/themeCatalog.ts";
import { SafeAreaModalBackdrop } from "../../SafeAreaModalBackdrop.tsx";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

export type RunReorderPickupFeedback = {
  haptic: "medium";
};

export type RunReorderDesignPreview = {
  pickedUpRunId: string;
};

export type SprintRulesGuidePresentation = {
  durationLabel: string;
  maxMistakes: number;
  targetCorrect: number;
};

const PRACTICE_MODE_DESCRIPTIONS: Record<SprintMode, string> = {
  standard: "Find the best move",
  arrow_duel: "Choose the best move",
  blitz: "Fast time control",
  custom: "Time, theme, rating"
};

export type PracticeModeSummary = {
  mode: SprintMode;
  config: SprintConfig;
  rating?: number;
};

export function PracticeHome({
  adaptiveLayout,
  mode,
  modes,
  currentRating,
  personalBestChallenge,
  progress,
  runManagement,
  sprintRulesGuide,
  sprintRulesGuideVisible,
  tacticalProfile,
  resumableSprint,
  onDismissSprintRulesGuide,
  onOpenPersonalBestHub,
  onOpenSprintRulesGuide,
  onSelectMode,
  onStartMode,
  onResumeSprint,
  nativeRunReorderScrollController,
  runReorderDesignPreview,
  onRunReorderFeedbackPreview
}: {
  adaptiveLayout: AdaptiveLayout;
  mode: SprintMode;
  modes: PracticeModeSummary[];
  currentRating: number;
  personalBestChallenge?: PersonalBestChallengeDesignPreview;
  progress: PracticeProgressSummary;
  runManagement?: PracticeRunManagementPresentation;
  sprintRulesGuide?: SprintRulesGuidePresentation;
  sprintRulesGuideVisible: boolean;
  tacticalProfile?: TacticalProfilePresentation;
  resumableSprint: SprintState | null;
  onDismissSprintRulesGuide: () => void;
  onOpenPersonalBestHub: (run?: PersonalBestPausedRunPresentation) => void;
  onOpenSprintRulesGuide: () => void;
  onSelectMode: (next: SprintMode) => void;
  onStartMode: (next: SprintMode) => void;
  onResumeSprint: (sprint: SprintState) => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: RunReorderDesignPreview;
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const selectedRun = runManagement?.runs.find((run) => run.id === runManagement.selectedRunId) ?? null;
  const progressMode = selectedRun?.mode ?? mode;

  return (
    <View style={styles.practiceHome} testID="practice-home">
      {resumableSprint ? (
        <ResumeSprintCard
          sprint={resumableSprint}
          onResume={() => onResumeSprint(resumableSprint)}
        />
      ) : null}

      <View
        style={adaptiveLayout.usesHomeColumns ? styles.practiceHomeColumns : styles.practiceHomeStack}
        testID="practice-home-layout"
      >
        <View style={[
          styles.practiceHomePrimaryColumn,
          adaptiveLayout.usesHomeColumns
            ? styles.practiceHomePrimaryColumnWide
            : styles.practiceHomeColumnStacked
        ]} testID="practice-home-primary-column">
          {runManagement ? (
            <>
              <PracticeRunHome
                presentation={runManagement}
                sprintRulesGuide={sprintRulesGuide}
                sprintRulesGuideVisible={sprintRulesGuideVisible}
                onDismissSprintRulesGuide={onDismissSprintRulesGuide}
                onOpenSprintRulesGuide={onOpenSprintRulesGuide}
                nativeRunReorderScrollController={nativeRunReorderScrollController}
                runReorderDesignPreview={runReorderDesignPreview}
                onRunReorderFeedbackPreview={onRunReorderFeedbackPreview}
              />
            </>
          ) : (
            <>
              <HomeStartHeader
                headerTestID="practice-action-header"
                startAccessibilityLabel={`Start ${modeLabel(mode)} sprint`}
                startTestID="practice-start-button"
                title="Start a Sprint"
                titleTestID="practice-header-title"
                onStart={() => onStartMode(mode)}
              />
              <View style={styles.homeRowGroup}>
                {modes.map((item, index) => (
                  <PracticeModeCard
                    key={item.mode}
                    active={mode === item.mode}
                    item={item}
                    position={groupPosition(index, modes.length)}
                    onPress={() => onSelectMode(item.mode)}
                  />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={[
          styles.practiceHomeSecondaryColumn,
          adaptiveLayout.usesHomeColumns
            ? styles.practiceHomeSecondaryColumnWide
            : styles.practiceHomeColumnStacked
        ]} testID="practice-home-secondary-column">
          {runManagement && !selectedRun ? (
            <PracticeNoRunProgressCard />
          ) : (
            <PracticeProgressCard
              currentRating={currentRating}
              mode={progressMode}
              progress={progress}
              ratingContextLabel={selectedRun?.name}
            />
          )}

          {runManagement && personalBestChallenge ? (
            <PersonalBestHomeCard
              presentation={personalBestChallenge}
              onOpenHub={onOpenPersonalBestHub}
            />
          ) : null}

          {tacticalProfile ? (
            <TacticalProfileHomeCard presentation={tacticalProfile} />
          ) : null}

        </View>
      </View>
    </View>
  );
}

function PracticeRunHome({
  presentation,
  sprintRulesGuide,
  sprintRulesGuideVisible,
  onDismissSprintRulesGuide,
  onOpenSprintRulesGuide,
  nativeRunReorderScrollController,
  runReorderDesignPreview,
  onRunReorderFeedbackPreview
}: {
  presentation: PracticeRunManagementPresentation;
  sprintRulesGuide?: SprintRulesGuidePresentation;
  sprintRulesGuideVisible: boolean;
  onDismissSprintRulesGuide: () => void;
  onOpenSprintRulesGuide: () => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: RunReorderDesignPreview;
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const [draggedRunId, setDraggedRunId] = useState<string | null>(null);
  const [dropTargetRunId, setDropTargetRunId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<RunDropTargetPosition | null>(null);
  const [insertionOutlineTop, setInsertionOutlineTop] = useState<number | null>(null);
  const [dropPreviewOffsets, setDropPreviewOffsets] = useState<Record<string, number>>({});
  const committedDropSettlingRef = useRef(false);
  const draggedRunIdRef = useRef<string | null>(null);
  const dropTargetRunIdRef = useRef<string | null>(null);
  const dropTargetPositionRef = useRef<RunDropTargetPosition | null>(null);
  const insertionOutlineTopRef = useRef<number | null>(null);
  const dropPreviewOffsetsRef = useRef<Record<string, number>>({});
  const webDragOriginCenterRef = useRef<number | null>(null);
  const dragSourceHeightRef = useRef(0);
  const dragSourceStrideRef = useRef(0);
  const webRunListElementRef = useRef<WebRunElement | null>(null);
  const nativeRunListElementRef = useRef<NativeRunReorderMeasureElement | null>(null);
  const runElementsRef = useRef(new Map<string, WebRunElement>());
  const nativeRunLayoutsRef = useRef(new Map<string, NativeRunLayout>());
  const nativeDragOriginCenterRef = useRef<number | null>(null);
  const previousRunRectsRef = useRef<Map<string, WebRunRect> | null>(null);
  const selectedRun = presentation.runs.find((run) => run.id === presentation.selectedRunId) ?? null;
  const showRestore = presentation.hiddenRuns.length > 0
    && (presentation.homeEditing || presentation.runs.length === 0);
  const registerRunElement = useCallback((runId: string, element: WebRunElement | null): void => {
    if (element) {
      runElementsRef.current.set(runId, element);
    } else {
      runElementsRef.current.delete(runId);
    }
  }, []);
  const recordNativeRunLayout = (runId: string, layout: NativeRunLayout): void => {
    // Native drag movement is evaluated against one geometry snapshot. React
    // Native can deliver queued onLayout generations after pickup, so accepting
    // them here would mix old and new card coordinates in the same gesture.
    // The committed drop already advances this snapshot optimistically; fresh
    // native layouts may replace it only after the gesture has finished.
    if (draggedRunIdRef.current === null) {
      nativeRunLayoutsRef.current.set(runId, layout);
    }
  };
  const captureRunPositions = (): void => {
    if (Platform.OS !== "web") {
      return;
    }
    previousRunRectsRef.current = new Map(
      [...runElementsRef.current].map(([runId, element]) => [runId, element.getBoundingClientRect()])
    );
  };
  const reorderRun = (
    runId: string,
    targetRunId: string,
    animateNativeLayout = true
  ): void => {
    if (runId !== targetRunId) {
      captureRunPositions();
      if (animateNativeLayout) {
        configureNativeRunLayoutAnimation();
      }
      presentation.onIntent({ type: "move-run", runId, targetRunId });
    }
  };
  const finishRunDrag = (): void => {
    nativeDragOriginCenterRef.current = null;
    draggedRunIdRef.current = null;
    dropTargetRunIdRef.current = null;
    dropTargetPositionRef.current = null;
    insertionOutlineTopRef.current = null;
    webDragOriginCenterRef.current = null;
    dragSourceHeightRef.current = 0;
    dragSourceStrideRef.current = 0;
    dropPreviewOffsetsRef.current = {};
    setDraggedRunId(null);
    setDropTargetRunId(null);
    setDropTargetPosition(null);
    setInsertionOutlineTop(null);
    setDropPreviewOffsets({});
  };
  const startRunDrag = (runId: string): void => {
    if (Platform.OS !== "web") {
      nativeRunReorderScrollController.refreshBounds(nativeRunListElementRef.current);
    }
    const layout = nativeRunLayoutsRef.current.get(runId);
    nativeDragOriginCenterRef.current = layout ? layout.y + layout.height / 2 : null;
    const webRunElement = runElementsRef.current.get(runId);
    const runIndex = presentation.runs.findIndex((run) => run.id === runId);
    const adjacentRun = presentation.runs[runIndex + 1] ?? presentation.runs[runIndex - 1];
    if (Platform.OS === "web" && webRunElement && runIndex >= 0) {
      const runRect = webRunElement.getBoundingClientRect();
      const adjacentRect = adjacentRun
        ? runElementsRef.current.get(adjacentRun.id)?.getBoundingClientRect()
        : undefined;
      webDragOriginCenterRef.current = runRect.top + runRect.height / 2;
      dragSourceHeightRef.current = runRect.height;
      dragSourceStrideRef.current = adjacentRect
        ? Math.abs(adjacentRect.top - runRect.top)
        : runRect.height;
    } else if (layout && runIndex >= 0) {
      const adjacentLayout = adjacentRun ? nativeRunLayoutsRef.current.get(adjacentRun.id) : undefined;
      dragSourceHeightRef.current = layout.height;
      dragSourceStrideRef.current = adjacentLayout
        ? Math.abs(adjacentLayout.y - layout.y)
        : layout.height;
    }
    draggedRunIdRef.current = runId;
    dropTargetRunIdRef.current = null;
    dropTargetPositionRef.current = null;
    insertionOutlineTopRef.current = null;
    dropPreviewOffsetsRef.current = {};
    setDraggedRunId(runId);
    setDropTargetRunId(null);
    setDropTargetPosition(null);
    setInsertionOutlineTop(null);
    setDropPreviewOffsets({});
    committedDropSettlingRef.current = false;
    onRunReorderFeedbackPreview?.({ haptic: "medium" });
  };
  const applyRunDropPreview = (
    preview: RunReorderPreview | null,
    outlineContainerTop = 0
  ): void => {
    const targetRunId = preview?.targetRunId ?? null;
    const targetPosition = preview?.targetPosition ?? null;
    const nextOffsets = preview?.offsets ?? {};
    const nextOutlineTop = preview
      ? preview.insertionOutlineTop - outlineContainerTop
      : null;
    const offsetsUnchanged = presentation.runs.every((run) =>
      (dropPreviewOffsetsRef.current[run.id] ?? 0) === (nextOffsets[run.id] ?? 0)
    );
    if (
      targetRunId === dropTargetRunIdRef.current
      && targetPosition === dropTargetPositionRef.current
      && nextOutlineTop === insertionOutlineTopRef.current
      && offsetsUnchanged
    ) {
      return;
    }
    dropTargetRunIdRef.current = targetRunId;
    dropTargetPositionRef.current = targetPosition;
    insertionOutlineTopRef.current = nextOutlineTop;
    dropPreviewOffsetsRef.current = nextOffsets;
    setDropTargetRunId(targetRunId);
    setDropTargetPosition(targetPosition);
    setInsertionOutlineTop(nextOutlineTop);
    setDropPreviewOffsets(nextOffsets);
  };
  const moveNativeRunDrag = (runId: string, translationY: number): void => {
    const originCenter = nativeDragOriginCenterRef.current;
    if (originCenter === null) {
      return;
    }
    const layouts = new Map<string, RunReorderItemLayout>();
    for (const [layoutRunId, nativeLayout] of nativeRunLayoutsRef.current) {
      layouts.set(layoutRunId, { height: nativeLayout.height, top: nativeLayout.y });
    }
    applyRunDropPreview(buildRunReorderPreview({
      layouts,
      originCenter,
      pointerCenter: originCenter + translationY,
      runId,
      runs: presentation.runs,
      sourceHeight: dragSourceHeightRef.current,
      sourceStride: dragSourceStrideRef.current
    }));
  };
  const previewWebRunDropTarget = (runId: string, pointerY: number): void => {
    const runOriginCenter = webDragOriginCenterRef.current;
    const listRect = webRunListElementRef.current?.getBoundingClientRect();
    if (runOriginCenter === null || !listRect) {
      return;
    }
    const layouts = new Map<string, RunReorderItemLayout>();
    for (const run of presentation.runs) {
      const rect = runElementsRef.current.get(run.id)?.getBoundingClientRect();
      if (rect) {
        layouts.set(run.id, {
          height: rect.height,
          top: rect.top - (dropPreviewOffsetsRef.current[run.id] ?? 0)
        });
      }
    }
    applyRunDropPreview(buildRunReorderPreview({
      layouts,
      originCenter: runOriginCenter,
      pointerCenter: pointerY,
      runId,
      runs: presentation.runs,
      sourceHeight: dragSourceHeightRef.current,
      sourceStride: dragSourceStrideRef.current
    }), listRect.top);
  };
  const commitNativeRunLayoutPreview = (runId: string): void => {
    if (Platform.OS === "web" || insertionOutlineTopRef.current === null) {
      return;
    }
    const nextLayouts = new Map(nativeRunLayoutsRef.current);
    for (const run of presentation.runs) {
      const layout = nativeRunLayoutsRef.current.get(run.id);
      if (!layout) {
        continue;
      }
      nextLayouts.set(run.id, {
        height: layout.height,
        y: run.id === runId
          ? insertionOutlineTopRef.current
          : layout.y + (dropPreviewOffsetsRef.current[run.id] ?? 0)
      });
    }
    nativeRunLayoutsRef.current = nextLayouts;
  };
  const dropRun = (): boolean => {
    const runId = draggedRunIdRef.current;
    const targetRunId = dropTargetRunIdRef.current;
    if (runId && targetRunId) {
      committedDropSettlingRef.current = true;
      commitNativeRunLayoutPreview(runId);
      reorderRun(runId, targetRunId, false);
      finishRunDrag();
      return true;
    }
    finishRunDrag();
    return false;
  };
  const reorderRunWithKeyboard = (runId: string, direction: "up" | "down"): void => {
    const index = presentation.runs.findIndex((run) => run.id === runId);
    const target = presentation.runs[index + (direction === "up" ? -1 : 1)];
    if (target) {
      reorderRun(runId, target.id);
    }
  };

  useLayoutEffect(() => {
    const previousRects = previousRunRectsRef.current;
    previousRunRectsRef.current = null;
    if (Platform.OS !== "web" || !previousRects) {
      return;
    }
    for (const [runId, element] of runElementsRef.current) {
      const previousRect = previousRects.get(runId);
      if (!previousRect || typeof element.animate !== "function") {
        continue;
      }
      const nextRect = element.getBoundingClientRect();
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaY) < 0.5) {
        continue;
      }
      const isPickedUp = runId === draggedRunIdRef.current;
      const pickedUpOffset = isPickedUp ? -2 : 0;
      const pickedUpScale = isPickedUp ? " scale(1.015)" : "";
      element.getAnimations?.().forEach((animation) => animation.cancel());
      element.dataset.reorderAnimation = "moving";
      const animation = element.animate([
        { transform: `translate3d(0, ${deltaY + pickedUpOffset}px, 0)${pickedUpScale}` },
        { transform: `translate3d(0, ${pickedUpOffset}px, 0)${pickedUpScale}` }
      ], {
        duration: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      });
      const clearAnimationState = (): void => {
        if (element.dataset.reorderAnimation === "moving") {
          delete element.dataset.reorderAnimation;
        }
      };
      animation.onfinish = clearAnimationState;
      animation.oncancel = clearAnimationState;
    }
  }, [presentation.runs]);

  return (
    <View style={styles.homeRunPanel} testID="practice-run-management">
      <HomeStartHeader
        actionLabel={presentation.homeEditing ? "Done" : "Start"}
        headerTestID="practice-action-header"
        startAccessibilityLabel={presentation.homeEditing
          ? "Finish editing runs"
          : selectedRun
            ? `Start ${selectedRun.name}`
            : "Start a run"}
        startDisabled={!presentation.homeEditing && !selectedRun}
        startTestID={presentation.homeEditing ? "practice-run-home-done" : "practice-run-start"}
        title={presentation.homeEditing ? "Edit Runs" : "Start a Run"}
        titleTestID="practice-header-title"
        onStart={() => presentation.onIntent({
          type: presentation.homeEditing ? "toggle-home-edit" : "start-selected-run"
        })}
      />

      <AppText style={styles.homeHelperText} tone="secondary" variant="subheadline">
        {presentation.homeEditing
          ? Platform.OS === "web"
            ? "Drag a card to reorder, or use the arrow buttons."
            : "Touch and hold a card to drag, or use the arrow buttons."
          : "Choose a run, then start when you are ready."}
      </AppText>

      <View
        style={styles.runManagementToolbar}
        testID="practice-run-home-utilities"
      >
        {sprintRulesGuide && !presentation.homeEditing && !sprintRulesGuideVisible ? (
          <Button
            accessibilityLabel="How Sprint works"
            icon="help"
            label="How Sprint works"
            size="compact"
            testID="practice-sprint-rules-open"
            variant="plain"
            onPress={onOpenSprintRulesGuide}
          />
        ) : null}
        <View style={styles.runManagementToolbarActions}>
          {!presentation.homeEditing ? (
            <Button
              accessibilityLabel="Edit runs"
              label="Edit"
              size="compact"
              testID="practice-run-home-edit"
              variant="plain"
              onPress={() => presentation.onIntent({ type: "toggle-home-edit" })}
            />
          ) : null}
          <Button
            accessibilityLabel="Add a run"
            icon="add"
            label="Add Run"
            size="compact"
            testID="practice-add-run"
            variant="plain"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          />
        </View>
      </View>

      {sprintRulesGuide && !presentation.homeEditing && sprintRulesGuideVisible ? (
        <SprintRulesGuide
          presentation={sprintRulesGuide}
          onDismiss={onDismissSprintRulesGuide}
        />
      ) : null}

      {presentation.notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.runNotice}
          testID="practice-run-notice"
        >
          <Text style={styles.runNoticeText}>{presentation.notice}</Text>
        </View>
      ) : null}

      {presentation.runs.length === 0 ? (
        <Section testID="practice-runs-empty">
          <AppText variant="headline">No runs on Home</AppText>
          <AppText tone="secondary" variant="subheadline">
            Add a new run or restore one below. Saved ratings and history are still available.
          </AppText>
          <Button
            accessibilityLabel="Add a new run"
            icon="add"
            label="Add a Run"
            testID="practice-empty-add-run"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          />
        </Section>
      ) : (
        <View
          ref={(element) => {
            webRunListElementRef.current = element as unknown as WebRunElement | null;
            nativeRunListElementRef.current = element as unknown as NativeRunReorderMeasureElement | null;
          }}
          style={[styles.homeRowGroup, { position: "relative" }]}
          testID="practice-run-list"
        >
          {presentation.runs.map((run, index) => (
            <React.Fragment key={run.id}>
              <PracticeRunCard
                position={groupPosition(index, presentation.runs.length)}
                active={run.id === presentation.selectedRunId}
                canMoveDown={index < presentation.runs.length - 1}
                canMoveUp={index > 0}
                dragging={run.id === (
                  draggedRunId
                  ?? (presentation.homeEditing ? runReorderDesignPreview?.pickedUpRunId : null)
                )}
                committedDropSettling={committedDropSettlingRef.current}
                dropPreviewOffsetY={dropPreviewOffsets[run.id] ?? 0}
                directRunEditing={presentation.directRunEditing === true}
                dropTargetPosition={run.id === dropTargetRunId && run.id !== draggedRunId
                  ? dropTargetPosition
                  : null}
                dropTarget={run.id === dropTargetRunId && run.id !== draggedRunId}
                editing={presentation.homeEditing}
                run={run}
                onIntent={presentation.onIntent}
                onCardElement={registerRunElement}
                onDragEnd={finishRunDrag}
                onDragStart={startRunDrag}
                nativeRunReorderScrollController={nativeRunReorderScrollController}
                onDrop={dropRun}
                onKeyboardReorder={reorderRunWithKeyboard}
                onNativeDragMove={moveNativeRunDrag}
                onNativeLayout={recordNativeRunLayout}
                onWebDragMove={previewWebRunDropTarget}
                onWebDrop={dropRun}
              />
              {presentation.removeCandidateId === run.id ? (
                <RunRemovalConfirmation run={run} onIntent={presentation.onIntent} />
              ) : null}
            </React.Fragment>
          ))}
          {Platform.OS === "web" && insertionOutlineTop !== null && dropTargetPosition ? (
            <div
              aria-hidden="true"
              data-run-insertion-outline={dropTargetPosition}
              data-run-insertion-target={dropTargetRunId
                ? `practice-run-${safeTestId(dropTargetRunId)}`
                : undefined}
              style={{
                backgroundColor: appTheme.colors.accent.dropZone,
                border: `2px dashed ${appTheme.colors.accent.s600}`,
                borderRadius: 12,
                boxSizing: "border-box",
                height: dragSourceHeightRef.current,
                left: 0,
                pointerEvents: "none",
                position: "absolute",
                right: 0,
                top: insertionOutlineTop,
                zIndex: 15
              }}
            />
          ) : null}
          {Platform.OS !== "web" && insertionOutlineTop !== null && dropTargetPosition ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[
                styles.runInsertionOutline,
                {
                  height: dragSourceHeightRef.current,
                  top: insertionOutlineTop
                }
              ]}
              testID="practice-run-insertion-outline"
            />
          ) : null}
        </View>
      )}

      {showRestore ? (
        <Section
          footer="Restoring a run keeps its existing rating and history."
          header="Restore to Home"
          rows
          testID="practice-run-restore-section"
        >
          {presentation.hiddenRuns.map((run) => (
            <ListRow
              key={run.id}
              icon={runIconName(run)}
              subtitle={`Rating ${run.elo}`}
              title={run.name}
              trailing={(
                <Button
                  accessibilityLabel={`Restore ${run.name} to Home`}
                  label="Restore"
                  size="compact"
                  testID={`practice-run-restore-${safeTestId(run.id)}`}
                  variant="secondary"
                  onPress={() => presentation.onIntent({ type: "restore-run", runId: run.id })}
                />
              )}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function SprintRulesGuide({
  presentation,
  onDismiss
}: {
  presentation: SprintRulesGuidePresentation;
  onDismiss: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const mistakeLimitDetail = `The ${ordinalWord(presentation.maxMistakes)} mistake ends the Sprint.`;
  // One badge width for every rule so the descriptions share a column. The
  // width follows the text size; when it would take more than a third of the
  // card (narrow screens at accessibility sizes), badges stack above their copy.
  const { fontScale, width: viewportWidth } = usePracticeViewport();
  const [listWidth, setListWidth] = useState(0);
  const badgeMinWidth = Math.ceil(SPRINT_RULE_BADGE_MIN_WIDTH * Math.max(1, fontScale));
  const stacked = listWidth > 0 && badgeMinWidth > listWidth / 3;
  const ruleLayout = { badgeMinWidth, stacked };
  // The dismiss button never shrinks, so at accessibility sizes it takes most
  // of the header row and squeezes the title to one word per line. Past a third
  // of the card it moves below the title, which then gets the full width.
  const dismissMinWidth = Math.ceil(SPRINT_RULES_DISMISS_MIN_WIDTH * Math.max(1, fontScale));
  // Until the list reports its width, estimate it from the screen (page and card
  // padding) so the first frame does not flip from side by side to stacked.
  const dismissStacked = dismissMinWidth > (listWidth > 0 ? listWidth : viewportWidth - 64) / 3;

  return (
    <View
      accessibilityLabel={`Your first Sprint. Solve ${presentation.targetCorrect} puzzles to pass. Time limit: Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear. Mistake limit: ${mistakeLimitDetail} Slow warning: The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake. Puzzle timeout: When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear. For example, solving ${presentation.targetCorrect} puzzles with one mistake means ${presentation.targetCorrect} solved and ${presentation.targetCorrect + 1} attempted.`}
      style={styles.sprintRulesGuide}
      testID="practice-sprint-rules-guide"
    >
      <View
        style={[styles.sprintRulesGuideHeader, dismissStacked ? styles.sprintRulesGuideHeaderStacked : null]}
        testID="practice-sprint-rules-header"
      >
        <View style={[styles.sprintRulesGuideTitleBlock, dismissStacked ? styles.sprintRulesGuideTitleBlockStacked : null]}>
          <Text style={styles.sprintRulesEyebrow}>YOUR FIRST SPRINT</Text>
          <Text maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE} style={styles.sprintRulesGuideTitle}>
            Solve {presentation.targetCorrect} puzzles to pass
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss Sprint rules"
          style={[styles.sprintRulesDismissButton, dismissStacked ? styles.sprintRulesDismissButtonStacked : null]}
          testID="practice-sprint-rules-dismiss"
          onPress={onDismiss}
        >
          <Text maxFontSizeMultiplier={HEADLINE_MAX_FONT_SCALE} numberOfLines={1} style={styles.sprintRulesDismissText}>Got it</Text>
        </Pressable>
      </View>

      <View
        style={styles.sprintRulesList}
        testID="practice-sprint-rules-list"
        onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
      >
        <SprintRuleRow
          layout={ruleLayout}
          badge={presentation.durationLabel}
          detail="Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear."
          label="Time limit"
        />
        <SprintRuleRow
          layout={ruleLayout}
          badge={String(presentation.maxMistakes)}
          detail={mistakeLimitDetail}
          label="Mistake limit"
          tone="danger"
        />
        <SprintRuleRow
          layout={ruleLayout}
          badge="SLOW"
          detail="The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake."
          label="Slow warning"
          tone="warning"
        />
        <SprintRuleRow
          layout={ruleLayout}
          badge="TIMEOUT"
          detail="When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear."
          label="Puzzle timeout"
          tone="danger"
        />
      </View>

      <Text style={styles.sprintRulesGuideFootnote}>
        Example: {presentation.targetCorrect} solved + 1 mistake = {presentation.targetCorrect + 1} attempted.
      </Text>
    </View>
  );
}

const SPRINT_RULE_BADGE_MIN_WIDTH = 72;
// "Got it" at the headline size plus the button's horizontal padding.
const SPRINT_RULES_DISMISS_MIN_WIDTH = 80;

function SprintRuleRow({
  badge,
  detail,
  label,
  layout,
  tone = "default"
}: {
  badge: string;
  detail: string;
  label: string;
  layout: { badgeMinWidth: number; stacked: boolean };
  tone?: "default" | "danger" | "warning";
}): React.JSX.Element {
  const styles = useStyles();
  const ruleTestId = safeTestId(label);

  return (
    <View
      style={[styles.sprintRuleRow, layout.stacked ? styles.sprintRuleRowStacked : null]}
      testID={`practice-sprint-rule-${ruleTestId}`}
    >
      <View style={[
        styles.sprintRuleBadge,
        layout.stacked ? null : { minWidth: layout.badgeMinWidth },
        tone === "danger" ? styles.sprintRuleBadgeDanger : null,
        tone === "warning" ? styles.sprintRuleBadgeWarning : null
      ]} testID={`practice-sprint-rule-${ruleTestId}-badge`}>
        <Text
          numberOfLines={1}
          style={[
            styles.sprintRuleBadgeText,
            tone === "danger" ? styles.sprintRuleBadgeTextDanger : null,
            tone === "warning" ? styles.sprintRuleBadgeTextWarning : null
          ]}
        >
          {badge}
        </Text>
      </View>
      <View
        style={styles.sprintRuleCopy}
        testID={`practice-sprint-rule-${ruleTestId}-copy`}
      >
        <Text style={styles.sprintRuleLabel}>{label}</Text>
        <Text style={styles.sprintRuleDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function PracticeRunCard({
  active,
  position,
  canMoveDown,
  canMoveUp,
  committedDropSettling,
  directRunEditing,
  dragging,
  dropPreviewOffsetY,
  dropTargetPosition,
  dropTarget,
  editing,
  nativeRunReorderScrollController,
  onIntent,
  onCardElement,
  onDragEnd,
  onDragStart,
  onNativeDragMove,
  onNativeLayout,
  onWebDragMove,
  onWebDrop,
  onDrop,
  onKeyboardReorder,
  run
}: {
  active: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  committedDropSettling: boolean;
  directRunEditing: boolean;
  dragging: boolean;
  dropPreviewOffsetY: number;
  dropTargetPosition: RunDropTargetPosition | null;
  dropTarget: boolean;
  editing: boolean;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  onIntent: PracticeRunManagementPresentation["onIntent"];
  onCardElement: (runId: string, element: WebRunElement | null) => void;
  onDragEnd: () => void;
  onDragStart: (runId: string) => void;
  onNativeDragMove: (runId: string, translationY: number) => void;
  onNativeLayout: (runId: string, layout: NativeRunLayout) => void;
  onWebDragMove: (runId: string, pointerY: number) => void;
  onWebDrop: () => void;
  onDrop: () => boolean;
  onKeyboardReorder: (runId: string, direction: "up" | "down") => void;
  run: PracticeRunPresentation;
  position: GroupPosition;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const details = run.kind === "custom"
    ? `${run.themes.map(customThemeLabel).join(" + ")} · ${formatSprintTimingLabel({
        ...defaultSprintConfig(run.mode),
        durationSeconds: run.durationSeconds,
        perPuzzleSeconds: run.perPuzzleSeconds
      })}`
    : run.kind === "arrow_duel"
      ? "Choose between two candidate moves"
      : "Find the best move";

  return (
    <RunCardDropSurface
      draggable={editing}
      dragging={dragging}
      committedDropSettling={committedDropSettling}
      dropPreviewOffsetY={dropPreviewOffsetY}
      dropTargetPosition={dropTargetPosition}
      dropTarget={dropTarget}
      nativeRunReorderScrollController={nativeRunReorderScrollController}
      runId={run.id}
      runName={run.name}
      style={[
        styles.homeRow,
        homeRowPositionStyle(styles, dragging ? "only" : position),
        active && !editing ? styles.homeRowSelected : null,
        editing ? styles.homeRowEditing : null,
        dragging ? styles.homeRowDragging : null
      ]}
      testID={`practice-run-${safeTestId(run.id)}`}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onElementChange={onCardElement}
      onNativeDragMove={onNativeDragMove}
      onNativeLayout={onNativeLayout}
      onWebDragMove={onWebDragMove}
      onWebDrop={onWebDrop}
      onDrop={onDrop}
    >
      {dragging ? null : <HomeRowSeparator position={position} />}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active && !editing }}
        accessibilityLabel={editing
          ? directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`
          : `Select ${run.name}, rating ${run.elo}, ${details}`}
        style={styles.homeRowSelectArea}
        testID={`practice-run-select-${safeTestId(run.id)}`}
        onPress={() => presentationRunPress(editing, run.id, onIntent)}
      >
        <View testID={`practice-run-${safeTestId(run.id)}-icon`}>
          <IconTile name={runIconName(run)} />
        </View>
        <View style={styles.homeRowCopy}>
          <AppText
            ellipsizeMode="tail"
            numberOfLines={1}
            testID={`practice-run-name-${safeTestId(run.id)}`}
            variant="headline"
          >
            {run.name}
          </AppText>
          <AppText ellipsizeMode="tail" numberOfLines={2} tone="secondary" variant="subheadline">{details}</AppText>
        </View>
      </Pressable>
      <View style={[styles.homeRowMeta, editing ? styles.homeRowEditingMeta : null]}>
        <AppText
          numberOfLines={1}
          style={styles.homeRowRating}
          testID={run.kind === "standard"
            ? "practice-mode-standard-rating"
            : run.kind === "arrow_duel"
              ? "practice-mode-arrow-duel-rating"
              : undefined}
          tone="secondary"
          variant="numeralRow"
        >
          {run.elo}
        </AppText>
        {editing ? (
          <View style={styles.runEditActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} up`}
              accessibilityState={{ disabled: !canMoveUp }}
              disabled={!canMoveUp}
              style={[styles.homeRowIconButton, !canMoveUp ? styles.homeRowIconButtonDisabled : null]}
              testID={`practice-run-move-up-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "up")}
            >
              <Icon color={appTheme.colors.accent.s600} name="chevronUp" size={18} weight="semibold" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} down`}
              accessibilityState={{ disabled: !canMoveDown }}
              disabled={!canMoveDown}
              style={[styles.homeRowIconButton, !canMoveDown ? styles.homeRowIconButtonDisabled : null]}
              testID={`practice-run-move-down-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "down")}
            >
              <Icon color={appTheme.colors.accent.s600} name="chevronDown" size={18} weight="semibold" />
            </Pressable>
            <Button
              accessibilityLabel={directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`}
              label={directRunEditing ? "Edit" : "Edit rating"}
              size="compact"
              testID={`practice-run-edit-${safeTestId(run.id)}`}
              variant="secondary"
              onPress={() => onIntent({ type: "edit-run", runId: run.id })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${run.name} from Home`}
              style={[styles.homeRowIconButton, styles.homeRowRemoveButton]}
              testID={`practice-run-remove-${safeTestId(run.id)}`}
              onPress={() => onIntent({ type: "remove-run", runId: run.id })}
            >
              <Icon color={appTheme.colors.danger.s600} name="remove" size={18} weight="semibold" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </RunCardDropSurface>
  );
}

type RunDropTargetPosition = "after" | "before";

type WebRunRect = {
  height: number;
  top: number;
};

type WebScrollRect = WebRunRect & {
  bottom: number;
};

type NativeRunLayout = {
  height: number;
  y: number;
};

export type NativeRunReorderMeasureElement = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

export type NativeRunReorderScrollSnapshot = {
  contentHeight: number;
  offsetY: number;
  reorderWindowBottom: number;
  reorderWindowTop: number;
  viewportHeight: number;
  windowBottom: number;
  windowTop: number;
};

export type NativeRunReorderScrollController = {
  scrollGestureRef: React.RefObject<GestureType | undefined>;
  getSnapshot: () => NativeRunReorderScrollSnapshot | null;
  refreshBounds: (reorderElement?: NativeRunReorderMeasureElement | null) => void;
  scrollBy: (deltaY: number) => number;
};

type RunReorderItemLayout = {
  height: number;
  top: number;
};

type RunReorderPreview = {
  insertionOutlineTop: number;
  offsets: Record<string, number>;
  targetPosition: RunDropTargetPosition;
  targetRunId: string;
};

function buildRunReorderPreview({
  layouts,
  originCenter,
  pointerCenter,
  runId,
  runs,
  sourceHeight,
  sourceStride
}: {
  layouts: ReadonlyMap<string, RunReorderItemLayout>;
  originCenter: number;
  pointerCenter: number;
  runId: string;
  runs: readonly PracticeRunPresentation[];
  sourceHeight: number;
  sourceStride: number;
}): RunReorderPreview | null {
  const runIndex = runs.findIndex((run) => run.id === runId);
  if (runIndex < 0 || pointerCenter === originCenter || sourceHeight <= 0 || sourceStride <= 0) {
    return null;
  }
  const movingDown = pointerCenter > originCenter;
  const target = runs
    .map((run, index) => ({ index, layout: layouts.get(run.id), run }))
    .filter((entry): entry is {
      index: number;
      layout: RunReorderItemLayout;
      run: PracticeRunPresentation;
    } => entry.run.id !== runId && entry.layout !== undefined)
    .filter((entry) => movingDown ? entry.index > runIndex : entry.index < runIndex)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.layout.top + left.layout.height / 2 - pointerCenter);
      const rightDistance = Math.abs(right.layout.top + right.layout.height / 2 - pointerCenter);
      return leftDistance - rightDistance;
    })[0];
  if (!target) {
    return null;
  }
  const targetCenter = target.layout.top + target.layout.height / 2;
  if (
    Math.abs(pointerCenter - originCenter)
    <= Math.abs(pointerCenter - targetCenter)
  ) {
    return null;
  }

  const previewOffset = movingDown ? -sourceStride : sourceStride;
  const firstShiftedIndex = Math.min(runIndex, target.index);
  const lastShiftedIndex = Math.max(runIndex, target.index);
  const offsets: Record<string, number> = {};
  runs.forEach((run, index) => {
    if (index >= firstShiftedIndex && index <= lastShiftedIndex && index !== runIndex) {
      offsets[run.id] = previewOffset;
    }
  });
  const targetPreviewOffset = offsets[target.run.id] ?? 0;
  const insertionGap = Math.max(8, sourceStride - target.layout.height);
  return {
    insertionOutlineTop: movingDown
      ? target.layout.top + targetPreviewOffset + target.layout.height + insertionGap
      : target.layout.top + targetPreviewOffset - insertionGap - sourceHeight,
    offsets,
    targetPosition: movingDown ? "after" : "before",
    targetRunId: target.run.id
  };
}

type WebRunAnimation = {
  cancel: () => void;
  oncancel: (() => void) | null;
  onfinish: (() => void) | null;
};

type WebRunElement = {
  animate?: (
    keyframes: readonly { transform: string }[],
    options: { duration: number; easing: string }
  ) => WebRunAnimation;
  closest?: (selectors: string) => unknown;
  dataset: Record<string, string | undefined>;
  getAnimations?: () => WebRunAnimation[];
  getBoundingClientRect: () => WebRunRect;
};

type WebRunStyle = React.CSSProperties & {
  paddingHorizontal?: React.CSSProperties["paddingLeft"];
  paddingVertical?: React.CSSProperties["paddingTop"];
};

type WebPointerCaptureElement = {
  closest?: (selectors: string) => unknown;
  querySelector?: (selectors: string) => { blur?: () => void } | null;
  releasePointerCapture?: (pointerId: number) => void;
  setPointerCapture?: (pointerId: number) => void;
};

type WebScrollableElement = {
  clientHeight: number;
  getBoundingClientRect: () => WebScrollRect;
  scrollHeight: number;
  scrollTop: number;
};

type WebTouchMoveEvent = {
  cancelable: boolean;
  preventDefault: () => void;
  touches: readonly { clientY: number }[];
};

type WebTouchMoveElement = {
  addEventListener: (
    type: "touchmove",
    listener: (event: WebTouchMoveEvent) => void,
    options: { passive: false }
  ) => void;
  removeEventListener: (
    type: "touchmove",
    listener: (event: WebTouchMoveEvent) => void
  ) => void;
};

const NATIVE_RUN_DRAG_HOLD_MS = 180;

function RunCardDropSurface({
  children,
  committedDropSettling,
  draggable,
  dragging,
  dropPreviewOffsetY,
  dropTargetPosition,
  dropTarget,
  nativeRunReorderScrollController,
  runId,
  runName,
  style,
  testID,
  onDragEnd,
  onDragStart,
  onElementChange,
  onNativeDragMove,
  onNativeLayout,
  onWebDragMove,
  onWebDrop,
  onDrop
}: {
  children: React.ReactNode;
  committedDropSettling: boolean;
  draggable: boolean;
  dragging: boolean;
  dropPreviewOffsetY: number;
  dropTargetPosition: RunDropTargetPosition | null;
  dropTarget: boolean;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runId: string;
  runName: string;
  style: React.ComponentProps<typeof View>["style"];
  testID: string;
  onDragEnd: () => void;
  onDragStart: (runId: string) => void;
  onElementChange: (runId: string, element: WebRunElement | null) => void;
  onNativeDragMove: (runId: string, translationY: number) => void;
  onNativeLayout: (runId: string, layout: NativeRunLayout) => void;
  onWebDragMove: (runId: string, pointerY: number) => void;
  onWebDrop: () => void;
  onDrop: () => boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const nativeDragOffset = useRef(new Animated.Value(0)).current;
  const nativeDropPreviewOffset = useRef(new Animated.Value(dropPreviewOffsetY)).current;
  const nativeDragActiveRef = useRef(false);
  const nativeGestureEndedRef = useRef(false);
  const nativeDragCompensationRef = useRef(0);
  const nativeDragDyRef = useRef(0);
  const nativeAutoScrollSpeedRef = useRef(0);
  const nativeAutoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [webDragOffsetY, setWebDragOffsetY] = useState(0);
  const webDragActiveRef = useRef(false);
  const webDragArmedRef = useRef(false);
  const webDragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webPointerRef = useRef<{
    latestClientY: number;
    originClientY: number;
    originScrollTop: number;
    pointerId: number;
    scrollElement: WebScrollableElement | null;
  } | null>(null);
  const webAutoScrollSpeedRef = useRef(0);
  const webAutoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webElementRef = useRef<WebTouchMoveElement | null>(null);
  const webSuppressClickRef = useRef(false);
  const stopNativeAutoScroll = useCallback((): void => {
    if (nativeAutoScrollTimerRef.current) {
      clearInterval(nativeAutoScrollTimerRef.current);
      nativeAutoScrollTimerRef.current = null;
    }
    nativeAutoScrollSpeedRef.current = 0;
  }, []);
  const disarmWebDrag = useCallback((): void => {
    if (webDragArmTimerRef.current) {
      clearTimeout(webDragArmTimerRef.current);
      webDragArmTimerRef.current = null;
    }
    webDragArmedRef.current = false;
  }, []);
  const stopWebAutoScroll = useCallback((): void => {
    if (webAutoScrollTimerRef.current) {
      clearInterval(webAutoScrollTimerRef.current);
      webAutoScrollTimerRef.current = null;
    }
    webAutoScrollSpeedRef.current = 0;
  }, []);
  const applyWebDragPosition = useCallback((clientY: number): void => {
    const pointer = webPointerRef.current;
    if (!pointer || !webDragActiveRef.current) {
      return;
    }
    pointer.latestClientY = clientY;
    const scrollDelta = pointer.scrollElement
      ? pointer.scrollElement.scrollTop - pointer.originScrollTop
      : 0;
    setWebDragOffsetY(clientY - pointer.originClientY + scrollDelta);
    onWebDragMove(runId, clientY);
  }, [onWebDragMove, runId]);
  const refreshWebAutoScroll = useCallback((clientY: number): void => {
    const pointer = webPointerRef.current;
    const scrollElement = pointer?.scrollElement;
    if (!pointer || !scrollElement || !webDragActiveRef.current) {
      stopWebAutoScroll();
      return;
    }
    pointer.latestClientY = clientY;
    const scrollRect = scrollElement.getBoundingClientRect();
    const edgeSize = Math.min(64, scrollRect.height / 4);
    const distanceFromTop = clientY - scrollRect.top;
    const distanceFromBottom = scrollRect.bottom - clientY;
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    let speed = 0;
    if (distanceFromTop < edgeSize && scrollElement.scrollTop > 0) {
      speed = -Math.max(2, 14 * (1 - Math.max(0, distanceFromTop) / edgeSize));
    } else if (distanceFromBottom < edgeSize && scrollElement.scrollTop < maxScrollTop) {
      speed = Math.max(2, 14 * (1 - Math.max(0, distanceFromBottom) / edgeSize));
    }
    webAutoScrollSpeedRef.current = speed;
    if (speed === 0) {
      stopWebAutoScroll();
      return;
    }
    if (webAutoScrollTimerRef.current) {
      return;
    }
    webAutoScrollTimerRef.current = setInterval(() => {
      const activePointer = webPointerRef.current;
      const activeScrollElement = activePointer?.scrollElement;
      if (!activePointer || !activeScrollElement || !webDragActiveRef.current) {
        stopWebAutoScroll();
        return;
      }
      const activeMaxScrollTop = Math.max(
        0,
        activeScrollElement.scrollHeight - activeScrollElement.clientHeight
      );
      const nextScrollTop = Math.max(
        0,
        Math.min(activeMaxScrollTop, activeScrollElement.scrollTop + webAutoScrollSpeedRef.current)
      );
      if (nextScrollTop === activeScrollElement.scrollTop) {
        stopWebAutoScroll();
        return;
      }
      activeScrollElement.scrollTop = nextScrollTop;
      applyWebDragPosition(activePointer.latestClientY);
    }, 16);
  }, [applyWebDragPosition, stopWebAutoScroll]);
  const resetWebPointer = useCallback((): void => {
    stopWebAutoScroll();
    disarmWebDrag();
    webDragActiveRef.current = false;
    webPointerRef.current = null;
    setWebDragOffsetY(0);
  }, [disarmWebDrag, stopWebAutoScroll]);
  const beginWebDrag = useCallback((element: WebPointerCaptureElement): void => {
    if (webDragActiveRef.current) {
      return;
    }
    webDragActiveRef.current = true;
    webDragArmedRef.current = true;
    webSuppressClickRef.current = true;
    element.querySelector?.(":focus")?.blur?.();
    onDragStart(runId);
  }, [onDragStart, runId]);
  const handleWebTouchMove = useCallback((event: WebTouchMoveEvent): void => {
    const touch = event.touches[0];
    if (!touch || !webDragActiveRef.current) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    applyWebDragPosition(touch.clientY);
    refreshWebAutoScroll(touch.clientY);
  }, [applyWebDragPosition, refreshWebAutoScroll]);
  const registerWebElement = useCallback((rawElement: unknown): void => {
    const element = rawElement as (WebTouchMoveElement & WebRunElement) | null;
    const previousElement = webElementRef.current;
    if (previousElement && previousElement !== element) {
      previousElement.removeEventListener("touchmove", handleWebTouchMove);
    }
    if (element && previousElement !== element) {
      element.addEventListener("touchmove", handleWebTouchMove, { passive: false });
    }
    webElementRef.current = element;
    onElementChange(runId, element as unknown as WebRunElement | null);
  }, [handleWebTouchMove, onElementChange, runId]);
  useLayoutEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    if (committedDropSettling) {
      nativeDragOffset.stopAnimation();
      nativeDragOffset.setValue(0);
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
    }
    nativeDropPreviewOffset.stopAnimation();
    if (committedDropSettling && dropPreviewOffsetY === 0) {
      nativeDropPreviewOffset.setValue(0);
      return;
    }
    Animated.spring(nativeDropPreviewOffset, {
      toValue: dropPreviewOffsetY,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true
    }).start();
  }, [
    committedDropSettling,
    dropPreviewOffsetY,
    nativeDragOffset,
    nativeDropPreviewOffset
  ]);
  useEffect(() => () => {
    disarmWebDrag();
    stopNativeAutoScroll();
    stopWebAutoScroll();
  }, [disarmWebDrag, stopNativeAutoScroll, stopWebAutoScroll]);
  const nativeDragHandlersRef = useRef({
    runId,
    onDragEnd,
    onDragStart,
    onDrop,
    onNativeDragMove
  });
  nativeDragHandlersRef.current = {
    runId,
    onDragEnd,
    onDragStart,
    onDrop,
    onNativeDragMove
  };
  const applyNativeDragPosition = useCallback((translationY: number): void => {
    nativeDragDyRef.current = translationY;
    const effectiveTranslationY = translationY + nativeDragCompensationRef.current;
    nativeDragOffset.setValue(effectiveTranslationY);
    const handlers = nativeDragHandlersRef.current;
    handlers.onNativeDragMove(handlers.runId, effectiveTranslationY);
  }, [nativeDragOffset]);
  const refreshNativeAutoScroll = useCallback((pageY: number): void => {
    const snapshot = nativeRunReorderScrollController.getSnapshot();
    if (!snapshot || !nativeDragActiveRef.current) {
      stopNativeAutoScroll();
      return;
    }
    const visibleReorderTop = Math.max(snapshot.windowTop, snapshot.reorderWindowTop);
    const visibleReorderBottom = Math.min(snapshot.windowBottom, snapshot.reorderWindowBottom);
    const edgeSize = Math.min(24, snapshot.viewportHeight / 4);
    const distanceFromTop = pageY - visibleReorderTop;
    const distanceFromBottom = visibleReorderBottom - pageY;
    const maxOffsetY = Math.max(0, snapshot.contentHeight - snapshot.viewportHeight);
    const canScrollUp = snapshot.reorderWindowTop < snapshot.windowTop && snapshot.offsetY > 0;
    const canScrollDown = snapshot.reorderWindowBottom > snapshot.windowBottom
      && snapshot.offsetY < maxOffsetY;
    let speed = 0;
    if (distanceFromTop < edgeSize && canScrollUp) {
      speed = -Math.max(2, 14 * (1 - Math.max(0, distanceFromTop) / edgeSize));
    } else if (distanceFromBottom < edgeSize && canScrollDown) {
      speed = Math.max(2, 14 * (1 - Math.max(0, distanceFromBottom) / edgeSize));
    }
    nativeAutoScrollSpeedRef.current = speed;
    if (speed === 0) {
      stopNativeAutoScroll();
      return;
    }
    if (nativeAutoScrollTimerRef.current) {
      return;
    }
    nativeAutoScrollTimerRef.current = setInterval(() => {
      if (!nativeDragActiveRef.current) {
        stopNativeAutoScroll();
        return;
      }
      const appliedDeltaY = nativeRunReorderScrollController.scrollBy(
        nativeAutoScrollSpeedRef.current
      );
      if (appliedDeltaY === 0) {
        stopNativeAutoScroll();
        return;
      }
      nativeDragCompensationRef.current += appliedDeltaY;
      applyNativeDragPosition(nativeDragDyRef.current);
    }, 16);
  }, [applyNativeDragPosition, nativeRunReorderScrollController, stopNativeAutoScroll]);
  const settleNativeDragOffset = useCallback((): void => {
    Animated.spring(nativeDragOffset, {
      toValue: 0,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true
    }).start(() => {
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
    });
  }, [nativeDragOffset]);
  const cancelNativeDrag = useCallback((): void => {
    stopNativeAutoScroll();
    if (nativeDragActiveRef.current) {
      nativeDragActiveRef.current = false;
      nativeDragHandlersRef.current.onDragEnd();
    }
    settleNativeDragOffset();
  }, [settleNativeDragOffset, stopNativeAutoScroll]);
  const nativeDragGesture = useMemo(() => Gesture.Pan()
    .enabled(draggable)
    .activateAfterLongPress(NATIVE_RUN_DRAG_HOLD_MS)
    .minDistance(6)
    .shouldCancelWhenOutside(false)
    .blocksExternalGesture(nativeRunReorderScrollController.scrollGestureRef)
    .runOnJS(true)
    .onStart((event) => {
      const handlers = nativeDragHandlersRef.current;
      nativeGestureEndedRef.current = false;
      nativeDragActiveRef.current = true;
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
      nativeDragOffset.stopAnimation();
      nativeRunReorderScrollController.refreshBounds();
      handlers.onDragStart(handlers.runId);
      applyNativeDragPosition(event.translationY);
      refreshNativeAutoScroll(event.absoluteY);
    })
    .onUpdate((event) => {
      applyNativeDragPosition(event.translationY);
      refreshNativeAutoScroll(event.absoluteY);
    })
    .onEnd((_event, success) => {
      nativeGestureEndedRef.current = true;
      if (!success) {
        cancelNativeDrag();
        return;
      }
      stopNativeAutoScroll();
      nativeDragActiveRef.current = false;
      const committed = nativeDragHandlersRef.current.onDrop();
      if (!committed) {
        settleNativeDragOffset();
      }
    })
    .onFinalize(() => {
      if (nativeGestureEndedRef.current) {
        nativeGestureEndedRef.current = false;
        return;
      }
      cancelNativeDrag();
    }), [
    applyNativeDragPosition,
    cancelNativeDrag,
    draggable,
    nativeDragOffset,
    nativeRunReorderScrollController,
    refreshNativeAutoScroll,
    settleNativeDragOffset,
    stopNativeAutoScroll
  ]);

  const handleNativeLayout = (event: LayoutChangeEvent): void => {
    const layout = event.nativeEvent.layout;
    onNativeLayout(runId, { y: layout.y, height: layout.height });
  };

  if (Platform.OS === "web") {
    const flattenedStyle = StyleSheet.flatten(style) as WebRunStyle;
    const {
      paddingHorizontal,
      paddingVertical,
      ...webStyle
    } = flattenedStyle;
    const releasePointerCapture = (
      element: WebPointerCaptureElement,
      pointerId: number
    ): void => {
      try {
        element.releasePointerCapture?.(pointerId);
      } catch {
        // Synthetic Storybook pointer events are not registered as browser-owned pointers.
      }
    };
    return (
      <div
        aria-grabbed={draggable ? dragging : undefined}
        aria-dropeffect={dropTarget ? "move" : undefined}
        data-browser-drag-ghost={draggable ? "suppressed" : undefined}
        data-drag-mechanism={draggable ? "pointer" : undefined}
        data-drag-state={dragging ? "picked-up" : undefined}
        data-drop-position={dropTargetPosition ?? undefined}
        data-drop-preview-offset={dropPreviewOffsetY || undefined}
        data-pickup-haptic={dragging ? "medium" : undefined}
        data-testid={testID}
        draggable={false}
        ref={registerWebElement}
        style={{
          ...webStyle,
          boxShadow: dragging
            ? appTheme.elevation.web.raised
            : "none",
          boxSizing: "border-box",
          cursor: draggable ? (dragging ? "grabbing" : "grab") : "default",
          display: "flex",
          paddingBottom: webStyle.paddingBottom ?? paddingVertical,
          paddingLeft: webStyle.paddingLeft ?? paddingHorizontal,
          paddingRight: webStyle.paddingRight ?? paddingHorizontal,
          paddingTop: webStyle.paddingTop ?? paddingVertical,
          position: "relative",
          touchAction: draggable ? "pan-y" : undefined,
          transform: dragging
            ? `translate3d(10px, ${webDragOffsetY - 2}px, 0) scale(1.015)`
            : dropPreviewOffsetY
              ? `translate3d(0, ${dropPreviewOffsetY}px, 0)`
              : undefined,
          transition: webDragActiveRef.current
            ? "box-shadow 140ms ease"
            : "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms ease",
          userSelect: draggable ? "none" : undefined,
          WebkitTouchCallout: draggable ? "none" : undefined,
          WebkitUserSelect: draggable ? "none" : undefined,
          willChange: draggable ? "transform" : undefined,
          zIndex: dragging ? 20 : dropTarget ? 10 : undefined
        }}
        title={draggable ? `Drag ${runName} to reorder` : undefined}
        onContextMenu={(event) => {
          if (draggable) {
            event.preventDefault();
          }
        }}
        onDragStart={(event) => {
          event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (!webSuppressClickRef.current) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          webSuppressClickRef.current = false;
        }}
        onPointerDown={(event) => {
          const blockedControl = (event.target as unknown as WebRunElement).closest?.(
            '[data-testid^="practice-run-move-"], [data-testid^="practice-run-edit-"], [data-testid^="practice-run-remove-"]'
          );
          if (!draggable || blockedControl || event.button !== 0) {
            return;
          }
          resetWebPointer();
          const currentTarget = event.currentTarget as unknown as WebPointerCaptureElement;
          const scrollElement = currentTarget.closest?.(
            '[data-testid="practice-main-scroll"]'
          ) as WebScrollableElement | null | undefined;
          webPointerRef.current = {
            latestClientY: event.clientY,
            originClientY: event.clientY,
            originScrollTop: scrollElement?.scrollTop ?? 0,
            pointerId: event.pointerId,
            scrollElement: scrollElement ?? null
          };
          webDragArmedRef.current = event.pointerType !== "touch";
          if (event.pointerType === "touch") {
            const pointerId = event.pointerId;
            webDragArmTimerRef.current = setTimeout(() => {
              webDragArmTimerRef.current = null;
              if (webPointerRef.current?.pointerId === pointerId) {
                beginWebDrag(currentTarget);
              }
            }, 180);
          }
          try {
            currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            // Storybook play functions dispatch synthetic pointer events.
          }
        }}
        onPointerMove={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          const deltaY = event.clientY - pointer.originClientY;
          if (!webDragActiveRef.current) {
            if (Math.abs(deltaY) <= 6) {
              return;
            }
            if (!webDragArmedRef.current) {
              releasePointerCapture(
                event.currentTarget as unknown as WebPointerCaptureElement,
                event.pointerId
              );
              resetWebPointer();
              return;
            }
            beginWebDrag(event.currentTarget as unknown as WebPointerCaptureElement);
          }
          event.preventDefault();
          applyWebDragPosition(event.clientY);
          refreshWebAutoScroll(event.clientY);
        }}
        onPointerUp={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          const wasDragging = webDragActiveRef.current;
          releasePointerCapture(
            event.currentTarget as unknown as WebPointerCaptureElement,
            event.pointerId
          );
          if (wasDragging) {
            event.preventDefault();
            (event.currentTarget as unknown as WebPointerCaptureElement)
              .querySelector?.(":focus")?.blur?.();
            onWebDrop();
            setTimeout(() => {
              webSuppressClickRef.current = false;
            }, 0);
          }
          resetWebPointer();
        }}
        onPointerCancel={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          releasePointerCapture(
            event.currentTarget as unknown as WebPointerCaptureElement,
            event.pointerId
          );
          if (webDragActiveRef.current) {
            onDragEnd();
          }
          resetWebPointer();
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <GestureDetector gesture={nativeDragGesture}>
      <Animated.View
        accessibilityHint={draggable ? "Touch and hold, then drag vertically to reorder this run. Arrow buttons are also available." : undefined}
        onLayout={handleNativeLayout}
        style={[
          style,
          // Fabric may still hold a synchronous native-driver transform override
          // when Edit Runs closes, so keep the React prop type stable at zero.
          {
            transform: [
              { translateY: draggable && !committedDropSettling ? nativeDragOffset : 0 },
              { translateY: draggable && !committedDropSettling ? nativeDropPreviewOffset : 0 },
              { translateX: draggable && dragging ? 10 : 0 },
              { translateY: draggable && dragging ? -2 : 0 },
              { scale: draggable && dragging ? 1.015 : 1 }
            ]
          },
          dragging ? styles.runCardNativeDragging : null
        ]}
        testID={testID}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

function configureNativeRunLayoutAnimation(): void {
  if (Platform.OS === "web") {
    return;
  }
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    }
  });
}

function presentationRunPress(
  editing: boolean,
  runId: string,
  onIntent: PracticeRunManagementPresentation["onIntent"]
): void {
  onIntent(editing ? { type: "edit-run", runId } : { type: "select-run", runId });
}

export function StartConflictPrompt({
  canDiscard,
  onCancel,
  onDiscard,
  onResume
}: {
  canDiscard: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onResume: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <SafeAreaModalBackdrop style={styles.accessibleMoveModalBackdrop}>
        <ScrollView
          accessibilityViewIsModal
          contentContainerStyle={styles.startConflictContent}
          style={[styles.feedbackHandoffConfirmation, styles.startConflictCard]}
          testID="practice-start-conflict"
        >
          <AppText variant="title">Unfinished Run</AppText>
          <AppText tone="secondary" variant="body">
            Resume it, or discard it to start a new Run.
          </AppText>
          <View style={styles.feedbackHandoffActions}>
            <Button
              accessibilityLabel="Resume the unfinished Run"
              label="Resume"
              stretch
              testID="practice-start-conflict-resume"
              onPress={onResume}
            />
            {canDiscard ? (
              <Button
                accessibilityLabel="Discard the unfinished Run and start a new Run"
                label="Discard and start"
                stretch
                testID="practice-start-conflict-discard"
                variant="destructive"
                onPress={onDiscard}
              />
            ) : null}
            <Button
              accessibilityLabel="Keep the unfinished Run and cancel"
              label="Cancel"
              stretch
              testID="practice-start-conflict-cancel"
              variant="secondary"
              onPress={onCancel}
            />
          </View>
        </ScrollView>
      </SafeAreaModalBackdrop>
    </Modal>
  );
}

function PracticeNoRunProgressCard(): React.JSX.Element {
  return (
    <Section header="Progress" testID="practice-progress-no-run">
      <AppText variant="headline">No run selected</AppText>
      <AppText tone="secondary" variant="subheadline">Add or restore a run to see its current rating.</AppText>
    </Section>
  );
}

function ResumeSprintCard({
  onResume,
  sprint
}: {
  onResume: () => void;
  sprint: SprintState;
}): React.JSX.Element {
  const isTacticalFocus = sprint.config.tacticalFocus !== undefined;
  const completedCount = sprint.correctCount + sprint.mistakeCount;
  const remaining = Math.max(
    0,
    (isTacticalFocus
      ? sprint.config.maxAttempts ?? sprint.config.targetCorrect
      : sprint.config.targetCorrect) -
      (isTacticalFocus ? completedCount : sprint.correctCount)
  );
  return (
    <Section rows>
      <ListRow
        accessibilityLabel={isTacticalFocus
          ? `Resume Focused Run, ${completedCount} completed, ${remaining} left, ${sprint.mistakeCount} mistakes`
          : `Resume ${modeLabel(sprint.config.mode)} sprint`}
        icon="play"
        subtitle={isTacticalFocus
          ? `Focused Run · ${completedCount} completed · ${remaining} left · ${sprint.mistakeCount} mistakes`
          : `${modeLabel(sprint.config.mode)} · ${sprint.correctCount} solved · ${remaining} left · ${sprint.mistakeCount} mistakes`}
        testID="practice-resume-card"
        title={isTacticalFocus ? "Resume Focused Run" : "Resume sprint"}
        trailing={<AppText numberOfLines={1} tone="accent" variant="headline">Resume</AppText>}
        onPress={onResume}
      />
    </Section>
  );
}

export function PausedSessionPanel({
  onAbandon,
  onResume,
  state
}: {
  onAbandon: () => void;
  onResume: () => void;
  state: SprintState;
}): React.JSX.Element {
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const completedCount = state.correctCount + state.mistakeCount;
  const remaining = Math.max(
    0,
    (isTacticalFocus
      ? state.config.maxAttempts ?? state.config.targetCorrect
      : state.config.targetCorrect) -
      (isTacticalFocus ? completedCount : state.correctCount)
  );
  return (
    <View
      accessibilityLabel={isTacticalFocus
        ? `Paused Focused Run, ${completedCount} completed, ${remaining} left, ${state.mistakeCount} mistakes`
        : `Paused ${modeLabel(state.config.mode)} sprint, ${state.correctCount} solved, ${remaining} left`}
      style={styles.pausedSessionPanel}
      testID="paused-session-panel"
    >
      <View style={styles.pausedSessionCopy}>
        <Text style={styles.sectionLabel}>
          {isTacticalFocus ? "Focused Run paused" : "Sprint paused"}
        </Text>
        <Text style={styles.helperText}>
          {isTacticalFocus
            ? `${completedCount} completed · ${remaining} left · ${state.mistakeCount} mistakes`
            : `${modeLabel(state.config.mode)} · ${state.correctCount} solved · ${remaining} left · ${state.mistakeCount} mistakes`}
        </Text>
      </View>
      <View style={styles.pausedSessionActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTacticalFocus
            ? "Abandon paused Focused Run"
            : "Abandon paused sprint"}
          testID="paused-session-abandon"
          style={styles.secondaryButton}
          onPress={onAbandon}
        >
          <Text style={styles.secondaryButtonText}>Abandon</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTacticalFocus
            ? "Resume paused Focused Run"
            : "Resume paused sprint"}
          testID="paused-session-resume"
          style={styles.primaryButton}
          onPress={onResume}
        >
          <Text style={styles.primaryButtonText}>Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PracticeModeCard({
  active,
  item,
  position,
  onPress
}: {
  active: boolean;
  item: PracticeModeSummary;
  position: GroupPosition;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const label = modeLabel(item.mode);
  const detail = practiceModeDetailLabel(item);
  const ratingLabel = item.rating === undefined ? null : `Rating ${item.rating}`;
  const modeTestId = item.mode.replace("_", "-");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.mode === "custom"
        ? `Open Custom sprint setup, ${detail}`
        : `Select ${label} mode, ${detail}`}
      testID={`practice-mode-${modeTestId}`}
      style={({ pressed }) => [styles.homeRow, homeRowPositionStyle(styles, position), pressed ? styles.homeRowPressed : null]}
      onPress={onPress}
    >
      <HomeRowSeparator position={position} />
      <View style={styles.homeRowSelectArea}>
        <View testID={`practice-mode-${modeTestId}-icon`}>
          <IconTile name={modeIconName(item.mode)} />
        </View>
        <View style={styles.homeRowCopy}>
          <AppText variant="headline">{label}</AppText>
          <AppText
            ellipsizeMode="tail"
            numberOfLines={2}
            tone="secondary"
            variant="subheadline"
          >
            {PRACTICE_MODE_DESCRIPTIONS[item.mode]}
          </AppText>
          <View
            accessibilityLabel={detail}
            testID={`practice-mode-${modeTestId}-details`}
            style={styles.practiceModeDetailProbe}
          />
        </View>
      </View>
      <View style={styles.homeRowMeta}>
        {ratingLabel ? (
          <AppText numberOfLines={1} tone="secondary" testID={`practice-mode-${modeTestId}-rating`} variant="subheadline">{ratingLabel}</AppText>
        ) : null}
        {active ? (
          <Icon color={appTheme.colors.accent.s600} name="check" size={18} testID={`practice-mode-${modeTestId}-selected`} weight="semibold" />
        ) : null}
        {item.mode === "custom" ? (
          <View testID="practice-mode-custom-disclosure">
            <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

type GroupPosition = "only" | "first" | "middle" | "last";

function groupPosition(index: number, count: number): GroupPosition {
  if (count <= 1) {
    return "only";
  }
  if (index === 0) {
    return "first";
  }
  return index === count - 1 ? "last" : "middle";
}

// Rows in one grouped list keep their own surface so a dragged row can lift out
// of the group; the first and last rows carry the section corners and every row
// after the first draws an inset hairline.
function homeRowPositionStyle(
  styles: ReturnType<typeof useStyles>,
  position: GroupPosition
): React.ComponentProps<typeof View>["style"] {
  return [
    position === "only" || position === "first" ? styles.homeRowTop : null,
    position === "only" || position === "last" ? styles.homeRowBottom : null
  ];
}

// The inset hairline above every row after the first in a grouped list.
function HomeRowSeparator({ position }: { position: GroupPosition }): React.JSX.Element | null {
  const styles = useStyles();
  if (position === "only" || position === "first") {
    return null;
  }
  return <View pointerEvents="none" style={styles.homeRowSeparator} />;
}

function modeIconName(mode: SprintMode): IconName {
  return mode === "arrow_duel" ? "arrowDuel" : mode === "custom" ? "custom" : "standard";
}

function runIconName(run: Pick<PracticeRunPresentation, "kind" | "mode">): IconName {
  if (run.kind === "custom") {
    return "custom";
  }
  return run.mode === "arrow_duel" ? "arrowDuel" : "standard";
}

function HomeStartHeader({
  actionLabel = "Start",
  headerTestID,
  startAccessibilityLabel,
  startDisabled = false,
  startTestID,
  title,
  titleTestID,
  onStart
}: {
  actionLabel?: string;
  headerTestID: string;
  startAccessibilityLabel: string;
  startDisabled?: boolean;
  startTestID: string;
  title: string;
  titleTestID: string;
  onStart: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.homeStartHeader} testID={headerTestID}>
      <AppText accessibilityRole="header" style={styles.homeStartTitle} testID={titleTestID} variant="title">
        {title}
      </AppText>
      <Button
        accessibilityLabel={startAccessibilityLabel}
        disabled={startDisabled}
        icon={actionLabel === "Start" ? "play" : undefined}
        label={actionLabel}
        size="compact"
        testID={startTestID}
        onPress={onStart}
      />
    </View>
  );
}

function practiceModeDetailLabel(item: PracticeModeSummary): string {
  if (item.mode === "custom") {
    return "Configure time, theme, and rating";
  }
  return `${formatSprintTimingLabel(item.config)} · Rating ${item.rating ?? 600}`;
}

function ordinalWord(value: number): string {
  const words: Readonly<Record<number, string>> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth"
  };
  const word = words[value];
  if (word) {
    return word;
  }

  const modulo100 = value % 100;
  const suffix = modulo100 >= 11 && modulo100 <= 13
    ? "th"
    : value % 10 === 1
      ? "st"
      : value % 10 === 2
        ? "nd"
        : value % 10 === 3
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["accessibleMoveModalBackdrop", "feedbackHandoffActions", "feedbackHandoffConfirmation", "helperText", "homeRowCopy", "primaryButton", "primaryButtonText", "secondaryButton", "secondaryButtonText", "sectionLabel"]),
  practiceHome: {
    gap: theme.spacing.section
  },
  practiceHomeColumns: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.section
  },
  practiceHomeStack: {
    flexDirection: "column",
    gap: theme.spacing.section
  },
  practiceHomePrimaryColumn: {
    gap: theme.spacing.group,
    minWidth: 0
  },
  practiceHomePrimaryColumnWide: {
    flexBasis: 0,
    flexGrow: 1.1,
    flexShrink: 1,
    width: "auto"
  },
  practiceHomeSecondaryColumn: {
    gap: theme.spacing.section,
    minWidth: 280
  },
  practiceHomeSecondaryColumnWide: {
    flexBasis: 0,
    flexGrow: 0.9,
    flexShrink: 1,
    width: "auto"
  },
  practiceHomeColumnStacked: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    width: "100%"
  },
  homeStartHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingLeft: 4
  },
  homeStartTitle: {
    flexShrink: 1
  },
  homeRunPanel: {
    gap: theme.spacing.group
  },
  homeHelperText: {
    paddingHorizontal: 4
  },
  homeRowGroup: {
    gap: 0
  },
  homeRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  homeRowTop: {
    borderTopLeftRadius: theme.shape.card,
    borderTopRightRadius: theme.shape.card
  },
  homeRowBottom: {
    borderBottomLeftRadius: theme.shape.card,
    borderBottomRightRadius: theme.shape.card
  },
  homeRowSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  homeRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  homeRowEditing: {
    flexWrap: "wrap"
  },
  homeRowDragging: {
    borderRadius: theme.shape.card,
    elevation: 6,
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: theme.name === "dark" ? 0.5 : 0.16,
    shadowRadius: 16,
    zIndex: 20
  },
  homeRowSelectArea: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.minTarget,
    minWidth: 0
  },
  homeRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  homeRowEditingMeta: {
    justifyContent: "space-between",
    paddingBottom: 2,
    paddingLeft: theme.metrics.iconTile + theme.spacing.row,
    width: "100%"
  },
  // Ratings form one right-aligned, muted column; selection is shown by the
  // row tint, so no trailing check shifts a selected rating.
  homeRowRating: {
    textAlign: "right"
  },
  homeRowSelected: {
    backgroundColor: theme.colors.accent.s100
  },
  homeRowIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.control,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    minWidth: theme.metrics.minTarget
  },
  homeRowIconButtonDisabled: {
    opacity: 0.4
  },
  homeRowRemoveButton: {
    backgroundColor: theme.colors.danger.s100
  },
  // Plain buttons carry their own 8-pt padding, so the toolbar adds no gaps;
  // this keeps the link and actions on one line in a phone-landscape column.
  runManagementToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  // Edit and Add Run wrap onto a second line when large text makes them wider
  // than the screen, instead of running off its edge.
  runManagementToolbarActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    marginLeft: "auto"
  },
  sprintRulesGuide: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  sprintRulesGuideHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sprintRulesGuideHeaderStacked: {
    flexDirection: "column"
  },
  sprintRulesGuideTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sprintRulesGuideTitleBlockStacked: {
    alignSelf: "stretch",
    flex: 0
  },
  sprintRulesEyebrow: {
    ...theme.typography.footnote,
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight,
    letterSpacing: 0.4
  },
  sprintRulesGuideTitle: {
    ...theme.typography.title,
    color: theme.colors.text.primary
  },
  sprintRulesDismissButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.control,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 16
  },
  sprintRulesDismissButtonStacked: {
    alignSelf: "flex-start"
  },
  sprintRulesDismissText: {
    ...theme.typography.headline,
    color: theme.colors.text.onAccent
  },
  sprintRulesList: {
    gap: theme.spacing.row
  },
  sprintRuleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.minTarget
  },
  sprintRuleRowStacked: {
    flexDirection: "column",
    gap: theme.spacing.inline
  },
  sprintRuleBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.tile,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 8
  },
  sprintRuleBadgeDanger: {
    backgroundColor: theme.colors.danger.s100
  },
  sprintRuleBadgeWarning: {
    backgroundColor: theme.colors.warning.s100
  },
  sprintRuleBadgeText: {
    ...theme.typography.footnote,
    color: theme.colors.accent.s600,
    fontFamily: theme.fontFamily.mono,
    fontWeight: theme.typography.headline.fontWeight
  },
  sprintRuleBadgeTextDanger: {
    color: theme.colors.danger.s600
  },
  sprintRuleBadgeTextWarning: {
    color: theme.colors.warning.s600
  },
  sprintRuleCopy: {
    alignSelf: "stretch",
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  sprintRuleLabel: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  sprintRuleDetail: {
    ...theme.typography.footnote,
    color: theme.colors.text.tertiary
  },
  sprintRulesGuideFootnote: {
    ...theme.typography.footnote,
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: theme.colors.text.tertiary,
    paddingTop: theme.spacing.row
  },
  runNotice: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  runNoticeText: {
    color: theme.colors.accent.s700,
    fontSize: 12,
    fontWeight: "700"
  },
  runCardNativeDragging: {
    elevation: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    zIndex: 20
  },
  runInsertionOutline: {
    backgroundColor: theme.colors.accent.dropZone,
    borderColor: theme.colors.accent.s600,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 2,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 15
  },
  runEditActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  practiceModeDetailProbe: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    width: 0
  },
  pausedSessionPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  pausedSessionCopy: {
    gap: 4
  },
  pausedSessionActions: {
    flexDirection: "row",
    gap: 10
  },
  startConflictCard: {
    flexGrow: 0,
    flexShrink: 1
  },
  startConflictContent: {
    gap: theme.spacing.row
  },
}));
