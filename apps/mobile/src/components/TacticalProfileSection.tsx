import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View
} from "react-native";
import { makeStyles, useTheme } from "../theme/index.ts";
import {
  TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT,
  type TacticalProfileTaskFamily
} from "../../../../packages/core/src/index.ts";
import type {
  FocusedRunAllocation,
  TacticalProfilePresentation,
  TacticalProfileSignal
} from "./tacticalProfilePresentation.ts";

export function TacticalProfileHomeCard({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const primarySignal = homeLeadSignalFor(presentation);
  const content = homeContentFor(presentation, primarySignal);
  const recommendationCount = recommendedThemeLabels(presentation).length;
  const taskFamilies = recommendedTaskFamilies(presentation.signals);
  const canOpen = presentation.phase !== "building";

  return (
    <View testID="training-focus-section">
      <Text style={styles.sectionLabel}>Training focus</Text>
      <View
        accessibilityLabel={`Training focus. ${content.title}. ${content.body}${
          presentation.assurance === "provisional" ? " Early estimate." : ""
        }`}
        style={[styles.homeCard, homeToneStyle(styles, content.tone)]}
        testID="training-focus-card"
      >
        <View style={styles.homeHeader}>
          <View style={[styles.statusPill, statusPillStyle(styles, content.tone)]}>
            {presentation.phase === "building" ? (
              <ActivityIndicator color={theme.colors.accent.s700} size="small" testID="training-focus-building-indicator" />
            ) : null}
            <Text style={[styles.statusPillText, statusPillTextStyle(styles, content.tone)]}>
              {content.status}
            </Text>
          </View>
          {presentation.assurance === "provisional" ? (
            <Text style={styles.earlyEstimateLabel} testID="training-focus-early-estimate">
              Early estimate
            </Text>
          ) : null}
        </View>
        {primarySignal && taskFamilies.length > 1 ? (
          <Text style={styles.modeLabel} testID="training-focus-primary-mode">
            {taskFamilyLabel(primarySignal.taskFamily)}
          </Text>
        ) : null}
        <Text style={styles.homeTitle}>{content.title}</Text>
        <Text style={styles.body}>{content.body}</Text>
        {primarySignal ? (
          <EvidenceLine signal={primarySignal} />
        ) : null}
        {canOpen ? (
          <Pressable
            accessibilityRole="button"
            style={styles.cardAction}
            testID="training-focus-open-profile"
            onPress={() => presentation.onIntent({ type: "open-profile" })}
          >
            <Text style={styles.cardActionText}>
              {homeActionLabel(presentation, recommendationCount)}
            </Text>
            <Text style={styles.cardActionChevron}>›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function TacticalProfileFlow({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  if (presentation.screen === "explanation") {
    return <RecommendationExplanation presentation={presentation} />;
  }
  if (presentation.screen === "focused_run") {
    return <FocusedRunPreviewScreen presentation={presentation} />;
  }
  if (presentation.screen === "suppressed") {
    return <SuppressedRecommendation presentation={presentation} />;
  }
  return <TacticalProfileScreen presentation={presentation} />;
}

function TacticalProfileScreen({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const activeTaskFamily = activeTaskFamilyFor(presentation);
  const taskFamilies = signalTaskFamilies(presentation.signals);
  const familySignals = presentation.signals.filter(
    (signal) => signal.taskFamily === activeTaskFamily
  );
  const distinctSignals = distinctFamilySignals(familySignals);
  const visibleSignals = distinctSignals.slice(0, TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT);
  const recommendedSignals = visibleSignals.filter(
    (signal) => signal.status === "recommended"
  );
  const watchSignals = visibleSignals.filter((signal) => signal.status === "watch");
  const hiddenSignalCount = distinctSignals.length - visibleSignals.length;
  const canPreview = recommendedSignals.length > 0
    && presentation.focusedRunUnavailable === undefined
    && (
      presentation.focusedRun === undefined
      || presentation.focusedRun.taskFamily === activeTaskFamily
    );

  return (
    <View style={styles.flow} testID="tactical-profile-screen">
      <FlowHeader
        backLabel="Back to Practice"
        eyebrow="TRAINING FOCUS"
        title="Tactical profile"
        onBack={() => presentation.onIntent({ type: "close-profile" })}
      />
      {taskFamilies.length > 1 ? (
        <TaskFamilySelector
          activeTaskFamily={activeTaskFamily}
          taskFamilies={taskFamilies}
          onSelect={(taskFamily) =>
            presentation.onIntent({ type: "select-task-family", taskFamily })}
        />
      ) : null}
      <View style={styles.contextCard}>
        <Text style={styles.modeLabel} testID="tactical-profile-active-mode">
          {taskFamilyLabel(activeTaskFamily)}
        </Text>
        <Text style={styles.contextTitle}>{profileHeadingFor(presentation, familySignals)}</Text>
        <Text style={styles.body}>{profileBodyFor(presentation)}</Text>
        <Text style={styles.contextFoot}>
          {profileContextFor(presentation)}
        </Text>
      </View>

      {recommendedSignals.length > 0 ? (
        <View style={styles.signalSection} testID="tactical-profile-recommendations">
          <Text style={styles.sectionLabel}>
            {recommendedSignals.length === 1 ? "Recommended focus" : "Ranked focus"}
          </Text>
          {recommendedSignals.map((signal, index) => (
            <SignalCard
              key={signal.id}
              rank={recommendedSignals.length > 1 ? index + 1 : undefined}
              signal={signal}
              onExplain={() => presentation.onIntent({ type: "explain-signal", signalId: signal.id })}
            />
          ))}
        </View>
      ) : null}

      {watchSignals.length > 0 ? (
        <View style={styles.signalSection} testID="tactical-profile-watch-signals">
          <Text style={styles.sectionLabel}>Collecting evidence</Text>
          {watchSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onExplain={() => presentation.onIntent({ type: "explain-signal", signalId: signal.id })}
            />
          ))}
        </View>
      ) : null}

      {hiddenSignalCount > 0 ? (
        <Text style={styles.monitoringNote} testID="tactical-profile-more-signals">
          {hiddenSignalCount === 1
            ? "1 more pattern is being monitored in the background."
            : `${hiddenSignalCount} more patterns are being monitored in the background.`}
        </Text>
      ) : null}

      {recommendedSignals.length > 0 && presentation.focusedRunUnavailable ? (
        <View style={styles.unavailableCard} testID="focused-run-unavailable">
          <Text style={styles.sectionLabel}>Focused Run availability</Text>
          <Text style={styles.contextTitle}>{presentation.focusedRunUnavailable.title}</Text>
          <Text style={styles.body}>{presentation.focusedRunUnavailable.body}</Text>
        </View>
      ) : null}

      {canPreview ? (
        <View style={styles.flowActions}>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            testID="tactical-profile-preview-run"
            onPress={() => presentation.onIntent({ type: "preview-focused-run" })}
          >
            <Text style={styles.primaryButtonText}>Preview focused Run</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            testID="tactical-profile-not-now"
            onPress={() => presentation.onIntent({ type: "suppress-recommendation" })}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function RecommendationExplanation({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const signal = selectedSignalFor(presentation);
  if (!signal) {
    return <TacticalProfileScreen presentation={presentation} />;
  }
  const canPreview = signal.status === "recommended"
    && presentation.focusedRunUnavailable === undefined
    && (
      presentation.focusedRun === undefined
      || presentation.focusedRun.taskFamily === signal.taskFamily
    );

  return (
    <View style={styles.flow} testID="tactical-profile-explanation">
      <FlowHeader
        backLabel="Back to Tactical Profile"
        eyebrow={`${taskFamilyLabel(signal.taskFamily).toUpperCase()} · WHY THIS FOCUS`}
        title={signal.themeLabel}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <View style={styles.explanationHero}>
        <SignalKindPill kind={signal.kind} />
        <Text style={styles.explanationTitle}>{signalSummary(signal)}</Text>
        <EvidenceLine signal={signal} />
      </View>
      <View style={styles.explanationSection}>
        <Text style={styles.sectionTitle}>What we compared</Text>
        <Text style={styles.body}>
          Your results on this theme were compared with similar-difficulty {taskFamilyComparisonLabel(signal.taskFamily)} in ordinary mixed Runs.
        </Text>
      </View>
      <View style={styles.explanationSection}>
        <Text style={styles.sectionTitle}>Why this is actionable</Text>
        <Text style={styles.body}>
          The pattern repeats across different puzzles and sessions, and it is large enough to matter in training.
        </Text>
      </View>
      <View style={styles.explanationSection}>
        <Text style={styles.sectionTitle}>What does not decide this</Text>
        <Text style={styles.body}>
          Slow and Unclear labels, or whether a puzzle is in Review, do not count as proof of a theme weakness.
        </Text>
      </View>
      {canPreview ? (
        <View style={styles.flowActions}>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            testID="tactical-profile-explanation-preview"
            onPress={() => presentation.onIntent({ type: "preview-focused-run" })}
          >
            <Text style={styles.primaryButtonText}>Preview focused Run</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            testID="tactical-profile-explanation-not-now"
            onPress={() => presentation.onIntent({ type: "suppress-recommendation" })}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function FocusedRunPreviewScreen({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const preview = presentation.focusedRun;
  if (!preview || preview.taskFamily !== activeTaskFamilyFor(presentation)) {
    return <TacticalProfileScreen presentation={presentation} />;
  }

  return (
    <View style={styles.flow} testID="focused-run-preview">
      <FlowHeader
        backLabel="Back to Tactical Profile"
        eyebrow="PREVIEW"
        title={preview.title}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <Text style={styles.previewSummary}>
        {preview.totalPuzzleCount} puzzles · {preview.durationLabel}
      </Text>
      <Text style={styles.ratingAnchor} testID="focused-run-rating-anchor">
        {preview.ratingLabel}
      </Text>
      <View style={styles.allocationCard}>
        <Text style={styles.sectionTitle}>Training mix</Text>
        <Text style={styles.body}>
          Explicit quotas keep one theme from taking over. Only the two clearest focuses can enter one Run.
        </Text>
        <View style={styles.allocationBar} testID="focused-run-allocation-bar">
          {preview.allocations.map((allocation) => (
            <View
              key={allocation.id}
              style={[
                styles.allocationSegment,
                allocationToneStyle(styles, allocation),
                { flexGrow: allocation.puzzleCount }
              ]}
            />
          ))}
        </View>
        <View style={styles.allocationList}>
          {preview.allocations.map((allocation) => (
            <View key={allocation.id} style={styles.allocationRow}>
              <View style={[styles.allocationDot, allocationToneStyle(styles, allocation)]} />
              <Text style={styles.allocationLabel}>{allocation.label}</Text>
              <Text style={styles.allocationCount}>
                {allocation.puzzleCount} · {Math.round(allocation.puzzleCount / preview.totalPuzzleCount * 100)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.previewGuardrails}>
        <Text style={styles.sectionTitle}>How puzzles are chosen</Text>
        <Text style={styles.guardrailItem}>{focusedRunRatingGuardrail(preview.taskFamily)}</Text>
        <Text style={styles.guardrailItem}>• Recently seen and scheduled Review puzzles avoided</Text>
        <Text style={styles.guardrailItem}>• The mix stays fixed after the Run starts</Text>
        <Text style={styles.guardrailItem}>• Mixed practice keeps the session broad</Text>
      </View>
      <Text style={styles.previewFoot}>
        Later ordinary mixed Runs decide whether this focus still applies. This preview does not change your saved Runs.
      </Text>
      <View style={styles.flowActions}>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          testID="focused-run-start"
          onPress={() => presentation.onIntent({ type: "start-focused-run" })}
        >
          <Text style={styles.primaryButtonText}>Start focused Run</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          testID="focused-run-not-now"
          onPress={() => presentation.onIntent({ type: "suppress-recommendation" })}
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SuppressedRecommendation({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={[styles.flow, styles.suppressedFlow]} testID="tactical-profile-suppressed">
      <View style={styles.suppressedIcon}>
        <Text style={styles.suppressedIconText}>✓</Text>
      </View>
      <Text style={styles.suppressedTitle}>Focus hidden for now</Text>
      <Text style={styles.suppressedBody}>
        We will keep gathering evidence in mixed Runs without emphasizing this recommendation.
      </Text>
      <EarlyEstimateNotice presentation={presentation} />
      <Pressable
        accessibilityRole="button"
        style={styles.primaryButton}
        testID="tactical-profile-restore"
        onPress={() => presentation.onIntent({ type: "restore-recommendation" })}
      >
        <Text style={styles.primaryButtonText}>Show recommendation again</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.secondaryButton}
        testID="tactical-profile-back-home"
        onPress={() => presentation.onIntent({ type: "close-profile" })}
      >
        <Text style={styles.secondaryButtonText}>Back to Practice</Text>
      </Pressable>
    </View>
  );
}

function SignalCard({
  rank,
  signal,
  onExplain
}: {
  rank?: number;
  signal: TacticalProfileSignal;
  onExplain: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.signalCard} testID={`tactical-profile-signal-${signal.id}`}>
      <View style={styles.signalHeader}>
        <View style={styles.signalTitleRow}>
          {rank ? <Text style={styles.rank}>{rank}</Text> : null}
          <View style={styles.signalTitleCopy}>
            <Text style={styles.signalTitle}>{signal.themeLabel}</Text>
            <Text style={styles.priorityLabel}>{signal.priorityLabel}</Text>
          </View>
        </View>
        <SignalKindPill kind={signal.kind} />
      </View>
      <Text style={styles.signalSummary}>{signalSummary(signal)}</Text>
      <EvidenceLine signal={signal} />
      <Pressable
        accessibilityRole="button"
        style={styles.explainButton}
        testID={`tactical-profile-explain-${signal.id}`}
        onPress={onExplain}
      >
        <Text style={styles.explainButtonText}>Why this focus?</Text>
      </Pressable>
    </View>
  );
}

function TaskFamilySelector({
  activeTaskFamily,
  taskFamilies,
  onSelect
}: {
  activeTaskFamily: TacticalProfileTaskFamily;
  taskFamilies: readonly TacticalProfileTaskFamily[];
  onSelect: (taskFamily: TacticalProfileTaskFamily) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel="Choose tactical profile mode"
      style={styles.taskFamilySelector}
      testID="tactical-profile-task-family-selector"
    >
      {taskFamilies.map((taskFamily) => {
        const selected = taskFamily === activeTaskFamily;
        return (
          <Pressable
            key={taskFamily}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.taskFamilyTab, selected ? styles.taskFamilyTabSelected : null]}
            testID={`tactical-profile-task-family-${taskFamily}`}
            onPress={() => onSelect(taskFamily)}
          >
            <Text style={[styles.taskFamilyTabTitle, selected ? styles.taskFamilyTabTitleSelected : null]}>
              {taskFamilyLabel(taskFamily)}
            </Text>
            <Text style={[styles.taskFamilyTabBody, selected ? styles.taskFamilyTabBodySelected : null]}>
              {TASK_FAMILY_COPY[taskFamily].selectorBody}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EvidenceLine({ signal }: { signal: TacticalProfileSignal }): React.JSX.Element {
  const styles = useStyles();
  return (
    <Text style={styles.evidence} testID={`tactical-profile-evidence-${signal.id}`}>
      {formatCount(signal.distinctPuzzleCount, "different puzzle", "different puzzles")}
      {" · "}
      {formatCount(signal.distinctSessionCount, "session", "sessions")}
    </Text>
  );
}

function SignalKindPill({
  kind
}: {
  kind: TacticalProfileSignal["kind"];
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={[styles.kindPill, kind === "speed" ? styles.kindPillSpeed : styles.kindPillSolve]}>
      <Text style={[styles.kindPillText, kind === "speed" ? styles.kindPillTextSpeed : styles.kindPillTextSolve]}>
        {kind === "speed"
          ? "Completed-puzzle speed"
          : kind === "both"
            ? "Reliability & speed"
            : "Solve reliability"}
      </Text>
    </View>
  );
}

function FlowHeader({
  backLabel,
  eyebrow,
  title,
  onBack
}: {
  backLabel: string;
  eyebrow: string;
  title: string;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.flowHeader}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        style={styles.backButton}
        testID="tactical-profile-back"
        onPress={onBack}
      >
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <View style={styles.flowHeaderCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.flowTitle}>{title}</Text>
      </View>
    </View>
  );
}

function selectedSignalFor(
  presentation: TacticalProfilePresentation
): TacticalProfileSignal | undefined {
  return presentation.signals.find((signal) => signal.id === presentation.selectedSignalId)
    ?? presentation.signals.find(
      (signal) => signal.taskFamily === activeTaskFamilyFor(presentation)
    )
    ?? presentation.signals[0];
}

function signalSummary(signal: TacticalProfileSignal): string {
  if (signal.kind === "speed") {
    return "You solve these correctly, but more slowly than comparable puzzles.";
  }
  if (signal.kind === "both") {
    return "You complete these less reliably and solve completed puzzles more slowly than comparable puzzles.";
  }
  return "You complete these less reliably than comparable puzzles.";
}

function profileHeadingFor(
  presentation: TacticalProfilePresentation,
  signals: readonly TacticalProfileSignal[]
): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return `${taskFamilyLabel(activeTaskFamilyFor(presentation))} insights aren't ready`;
  }
  if (presentation.phase === "balanced") {
    return "Recent play looks balanced";
  }
  if (presentation.phase === "collecting") {
    return "Still collecting evidence";
  }
  if (signals.length > 1) {
    return "Your clearest training opportunities";
  }
  return signals[0]?.themeLabel ?? "Your tactical profile";
}

function profileBodyFor(presentation: TacticalProfilePresentation): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return "Playing more mixed Runs won't unlock recommendations yet.";
  }
  if (presentation.phase === "balanced") {
    return "Your recent completed puzzles look balanced after accounting for difficulty and Run settings.";
  }
  if (presentation.phase === "collecting") {
    return "Keep playing mixed Runs. We need results from more different puzzles and sessions before recommending a focus.";
  }
  return "Recommendations separate evidence, practical impact, and training priority.";
}

function profileContextFor(presentation: TacticalProfilePresentation): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return "Your practice history remains saved for a future validated model.";
  }
  if (presentation.assurance === "provisional") {
    return `This is an early estimate based on ordinary mixed ${taskFamilyRunLabel(activeTaskFamilyFor(presentation))} Runs. It may change as the model is validated with more players. Review and focused Runs do not shape discovery.`;
  }
  return `Based on ordinary mixed ${taskFamilyRunLabel(activeTaskFamilyFor(presentation))} Runs. Review and focused Runs do not shape discovery.`;
}

function homeContentFor(
  presentation: TacticalProfilePresentation,
  primarySignal?: TacticalProfileSignal
): {
  status: string;
  title: string;
  body: string;
  tone: "blue" | "green" | "amber" | "neutral";
} {
  if (presentation.phase === "building") {
    return {
      status: "Building profile",
      title: "Finding stable patterns",
      body: "Preparing a local profile from your mixed Run history.",
      tone: "blue"
    };
  }
  if (allTaskFamiliesUnavailable(presentation)) {
    return {
      status: "Not available yet",
      title: "Training insights aren't ready",
      body: "Personalized training is not enabled in this version. Your practice history remains saved.",
      tone: "neutral"
    };
  }
  if (presentation.phase === "collecting") {
    return {
      status: "Collecting evidence",
      title: "More information needed",
      body: "Keep playing mixed Runs. We will recommend a focus after a pattern repeats across different puzzles and sessions.",
      tone: "neutral"
    };
  }
  if (presentation.phase === "balanced") {
    return {
      status: "Balanced",
      title: "Recent play looks balanced",
      body: "There is no meaningful weakness to emphasize right now.",
      tone: "green"
    };
  }
  const taskFamilies = recommendedTaskFamilies(presentation.signals);
  if (taskFamilies.length > 1 && primarySignal) {
    const otherTaskFamily = taskFamilies.find(
      (taskFamily) => taskFamily !== primarySignal.taskFamily
    );
    const otherCount = distinctRecommendedSignals(presentation.signals).filter(
      (signal) => signal.taskFamily === otherTaskFamily
    ).length;
    return {
      status: `${taskFamilies.length} modes with recommendations`,
      title: `${primarySignal.themeLabel} is your clearest focus`,
      body: otherTaskFamily
        ? `${taskFamilyLabel(otherTaskFamily)} also has ${formatCount(otherCount, "recommendation", "recommendations")}.`
        : "Another mode also has a recommendation.",
      tone: "blue"
    };
  }
  const themeLabels = recommendedThemeLabels(presentation);
  if (themeLabels.length > 1 && primarySignal) {
    return {
      status: `${themeLabels.length} recommendations`,
      title: `${primarySignal.themeLabel} is your clearest focus`,
      body: secondaryFocusSummary(themeLabels.slice(1)),
      tone: "blue"
    };
  }
  return {
    status: "Recommended",
    title: primarySignal ? `${primarySignal.themeLabel} may need attention` : "A training focus is ready",
    body: primarySignal ? signalSummary(primarySignal) : "Review the evidence before choosing focused training.",
    tone: "blue"
  };
}

function EarlyEstimateNotice({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element | null {
  const styles = useStyles();
  if (presentation.assurance !== "provisional") {
    return null;
  }
  return (
    <View style={styles.earlyEstimateNotice} testID="tactical-profile-early-estimate">
      <Text style={styles.earlyEstimateNoticeTitle}>Early estimate</Text>
      <Text style={styles.earlyEstimateNoticeBody}>
        Use this as a training suggestion while we validate the model with more players.
      </Text>
    </View>
  );
}

function recommendedThemeLabels(presentation: TacticalProfilePresentation): string[] {
  return distinctRecommendedSignals(presentation.signals).map((signal) => signal.themeLabel);
}

function distinctRecommendedSignals(
  signals: readonly TacticalProfileSignal[]
): TacticalProfileSignal[] {
  const seenThemeKeys: Record<TacticalProfileTaskFamily, Set<string>> = {
    line: new Set<string>(),
    arrow_duel: new Set<string>()
  };
  return signals.filter((signal) => {
    const familyThemeKeys = seenThemeKeys[signal.taskFamily];
    if (signal.status !== "recommended" || familyThemeKeys.has(signal.themeKey)) {
      return false;
    }
    familyThemeKeys.add(signal.themeKey);
    return true;
  });
}

function distinctFamilySignals(
  signals: readonly TacticalProfileSignal[]
): TacticalProfileSignal[] {
  const seenThemeKeys = new Set<string>();
  return signals.filter((signal) => {
    if (seenThemeKeys.has(signal.themeKey)) {
      return false;
    }
    seenThemeKeys.add(signal.themeKey);
    return true;
  });
}

function homeLeadSignalFor(
  presentation: TacticalProfilePresentation
): TacticalProfileSignal | undefined {
  const recommendedSignals = distinctRecommendedSignals(presentation.signals);
  const taskFamilies = recommendedTaskFamilies(recommendedSignals);
  if (taskFamilies.length <= 1) {
    return recommendedSignals[0] ?? presentation.signals[0];
  }
  return presentation.homeLeadSignalId === undefined
    ? undefined
    : recommendedSignals.find((signal) => signal.id === presentation.homeLeadSignalId);
}

function recommendedTaskFamilies(
  signals: readonly TacticalProfileSignal[]
): TacticalProfileTaskFamily[] {
  return [...new Set(
    signals
      .filter((signal) => signal.status === "recommended")
      .map((signal) => signal.taskFamily)
  )];
}

function signalTaskFamilies(
  signals: readonly TacticalProfileSignal[]
): TacticalProfileTaskFamily[] {
  return [...new Set(signals.map((signal) => signal.taskFamily))];
}

function activeTaskFamilyUnavailable(
  presentation: TacticalProfilePresentation
): boolean {
  return presentation.phase === "collecting"
    && presentation.unavailableFamilies?.[activeTaskFamilyFor(presentation)] !== undefined;
}

function allTaskFamiliesUnavailable(
  presentation: TacticalProfilePresentation
): boolean {
  return presentation.phase === "collecting"
    && (["line", "arrow_duel"] as const).every(
      (taskFamily) => presentation.unavailableFamilies?.[taskFamily] !== undefined
    );
}

function activeTaskFamilyFor(
  presentation: TacticalProfilePresentation
): TacticalProfileTaskFamily {
  return presentation.activeTaskFamily
    ?? presentation.signals[0]?.taskFamily
    ?? "line";
}

function taskFamilyLabel(taskFamily: TacticalProfileTaskFamily): string {
  return TASK_FAMILY_COPY[taskFamily].label;
}

function taskFamilyRunLabel(taskFamily: TacticalProfileTaskFamily): string {
  return TASK_FAMILY_COPY[taskFamily].runLabel;
}

function taskFamilyComparisonLabel(taskFamily: TacticalProfileTaskFamily): string {
  return TASK_FAMILY_COPY[taskFamily].comparisonLabel;
}

function focusedRunRatingGuardrail(taskFamily: TacticalProfileTaskFamily): string {
  return TASK_FAMILY_COPY[taskFamily].ratingGuardrail;
}

const TASK_FAMILY_COPY = {
  line: {
    label: "Puzzle solving",
    selectorBody: "Standard, Blitz & Custom",
    runLabel: "puzzle-solving",
    comparisonLabel: "puzzles",
    ratingGuardrail: "• Rebuilt for your current Rating before each new Run"
  },
  arrow_duel: {
    label: "Arrow Duel",
    selectorBody: "Choose between two moves",
    runLabel: "Arrow Duel",
    comparisonLabel: "Arrow Duel choices",
    ratingGuardrail: "• Rebuilt for your current Arrow Duel Rating before each new Run"
  }
} satisfies Record<TacticalProfileTaskFamily, {
  label: string;
  selectorBody: string;
  runLabel: string;
  comparisonLabel: string;
  ratingGuardrail: string;
}>;

function homeActionLabel(
  presentation: TacticalProfilePresentation,
  recommendationCount: number
): string {
  if (presentation.phase !== "ready") {
    return "View tactical profile";
  }
  return recommendationCount > 1 ? "Review focuses" : "Review focus";
}

function secondaryFocusSummary(themeLabels: readonly string[]): string {
  if (themeLabels.length === 1) {
    return `${themeLabels[0]} is also worth reviewing.`;
  }
  if (themeLabels.length === 2) {
    return `${themeLabels[0]} and ${themeLabels[1]} are also worth reviewing.`;
  }
  return `There are ${themeLabels.length} more themes worth reviewing.`;
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

type Styles = ReturnType<typeof useStyles>;

function homeToneStyle(styles: Styles, tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.homeCardGreen;
  if (tone === "amber") return styles.homeCardAmber;
  if (tone === "neutral") return styles.homeCardNeutral;
  return styles.homeCardBlue;
}

function statusPillStyle(styles: Styles, tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.statusPillGreen;
  if (tone === "amber") return styles.statusPillAmber;
  if (tone === "neutral") return styles.statusPillNeutral;
  return styles.statusPillBlue;
}

function statusPillTextStyle(styles: Styles, tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.statusPillTextGreen;
  if (tone === "amber") return styles.statusPillTextAmber;
  if (tone === "neutral") return styles.statusPillTextNeutral;
  return styles.statusPillTextBlue;
}

function allocationToneStyle(styles: Styles, allocation: FocusedRunAllocation) {
  if (allocation.tone === "secondary") return styles.allocationSecondary;
  if (allocation.tone === "mixed") return styles.allocationMixed;
  return styles.allocationPrimary;
}

const useStyles = makeStyles((theme) => ({
  sectionLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  homeCard: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 9,
    padding: 16
  },
  homeCardBlue: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s200
  },
  homeCardGreen: {
    backgroundColor: theme.colors.success.s50,
    borderColor: theme.colors.success.s200
  },
  homeCardAmber: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s200
  },
  homeCardNeutral: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong
  },
  homeHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  earlyEstimateLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  statusPill: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusPillBlue: {
    backgroundColor: theme.colors.accent.s100
  },
  statusPillGreen: {
    backgroundColor: theme.colors.success.s100
  },
  statusPillAmber: {
    backgroundColor: theme.colors.warning.s100
  },
  statusPillNeutral: {
    backgroundColor: theme.colors.surfaceStrong
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800"
  },
  statusPillTextBlue: {
    color: theme.colors.accent.s700
  },
  statusPillTextGreen: {
    color: theme.colors.success.s700
  },
  statusPillTextAmber: {
    color: theme.colors.warning.s800
  },
  statusPillTextNeutral: {
    color: theme.colors.text.secondary
  },
  homeTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  modeLabel: {
    color: theme.colors.accent.s600,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  body: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    lineHeight: 21
  },
  evidence: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  cardAction: {
    alignItems: "center",
    borderTopColor: theme.colors.hairline.neutral,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    minHeight: 44,
    paddingTop: 10
  },
  cardActionText: {
    color: theme.colors.accent.s700,
    fontSize: 14,
    fontWeight: "800"
  },
  cardActionChevron: {
    color: theme.colors.accent.s700,
    fontSize: 24,
    lineHeight: 24
  },
  flow: {
    alignSelf: "center",
    gap: 16,
    maxWidth: 760,
    paddingBottom: 20,
    width: "100%"
  },
  flowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  backButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  backButtonText: {
    color: theme.colors.text.strong,
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2
  },
  flowHeaderCopy: {
    flex: 1
  },
  eyebrow: {
    color: theme.colors.accent.s600,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2
  },
  flowTitle: {
    color: theme.colors.text.primary,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 31
  },
  contextCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  contextTitle: {
    color: theme.colors.text.primary,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25
  },
  contextFoot: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    lineHeight: 18
  },
  earlyEstimateNotice: {
    backgroundColor: theme.colors.caution.s50,
    borderColor: theme.colors.caution.s200,
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  earlyEstimateNoticeTitle: {
    color: theme.colors.caution.s800,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  earlyEstimateNoticeBody: {
    color: theme.colors.caution.s900,
    fontSize: 13,
    lineHeight: 18
  },
  taskFamilySelector: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 16,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  taskFamilyTab: {
    borderRadius: 12,
    flex: 1,
    gap: 2,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  taskFamilyTabSelected: {
    backgroundColor: theme.colors.surface
  },
  taskFamilyTabTitle: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    fontWeight: "800"
  },
  taskFamilyTabTitleSelected: {
    color: theme.colors.text.primary
  },
  taskFamilyTabBody: {
    color: theme.colors.text.faint,
    fontSize: 10,
    lineHeight: 14
  },
  taskFamilyTabBodySelected: {
    color: theme.colors.text.tertiary
  },
  monitoringNote: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4
  },
  unavailableCard: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s200,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  signalSection: {
    gap: 10
  },
  signalCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  signalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  signalTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 10
  },
  rank: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: 16,
    color: theme.colors.text.onTone,
    fontSize: 13,
    fontWeight: "900",
    height: 30,
    lineHeight: 30,
    textAlign: "center",
    width: 30
  },
  signalTitleCopy: {
    flexShrink: 1
  },
  signalTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  priorityLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  kindPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  kindPillSolve: {
    backgroundColor: theme.colors.accent.s100
  },
  kindPillSpeed: {
    backgroundColor: theme.colors.warning.s100
  },
  kindPillText: {
    fontSize: 11,
    fontWeight: "800"
  },
  kindPillTextSolve: {
    color: theme.colors.accent.s700
  },
  kindPillTextSpeed: {
    color: theme.colors.warning.s800
  },
  signalSummary: {
    color: theme.colors.text.strong,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22
  },
  explainButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    paddingRight: 10
  },
  explainButtonText: {
    color: theme.colors.accent.s600,
    fontSize: 14,
    fontWeight: "800"
  },
  flowActions: {
    gap: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: theme.colors.text.onAccent,
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: theme.colors.text.strong,
    fontSize: 15,
    fontWeight: "800"
  },
  explanationHero: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s200,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 18
  },
  explanationTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 27
  },
  explanationSection: {
    backgroundColor: theme.colors.surface,
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    gap: 6,
    paddingBottom: 14
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  previewSummary: {
    color: theme.colors.text.secondary,
    fontSize: 15,
    fontWeight: "700"
  },
  ratingAnchor: {
    color: theme.colors.accent.s600,
    fontSize: 13,
    fontWeight: "800",
    marginTop: -8
  },
  allocationCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  allocationBar: {
    borderRadius: 999,
    flexDirection: "row",
    gap: 3,
    height: 12,
    overflow: "hidden"
  },
  allocationSegment: {
    flexBasis: 0
  },
  allocationPrimary: {
    backgroundColor: theme.colors.accent.fill
  },
  allocationSecondary: {
    backgroundColor: theme.colors.accent.s400
  },
  allocationMixed: {
    backgroundColor: theme.colors.fillStrong
  },
  allocationList: {
    gap: 10
  },
  allocationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    minHeight: 28
  },
  allocationDot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  allocationLabel: {
    color: theme.colors.text.strong,
    flex: 1,
    fontSize: 14,
    fontWeight: "700"
  },
  allocationCount: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    fontWeight: "700"
  },
  previewGuardrails: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  guardrailItem: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    lineHeight: 21
  },
  previewFoot: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  },
  suppressedFlow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
    paddingHorizontal: 18
  },
  suppressedIcon: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  suppressedIconText: {
    color: theme.colors.text.secondary,
    fontSize: 26,
    fontWeight: "900"
  },
  suppressedTitle: {
    color: theme.colors.text.primary,
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center"
  },
  suppressedBody: {
    color: theme.colors.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 460,
    textAlign: "center"
  }
}));
