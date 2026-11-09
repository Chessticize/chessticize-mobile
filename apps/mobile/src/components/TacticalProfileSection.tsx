import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles, useTheme } from "../theme/index.ts";
import { useUiHaptics } from "../platform/uiHaptics.ts";
import { AppText, Badge, Button, Icon, ListRow, Section, useListRowStyle } from "./ui/index.tsx";
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
    <Section header="Training focus" surfaceStyle={styles.homeSurface} testID="training-focus-section">
      <View
        accessibilityLabel={`Training focus. ${content.title}. ${content.body}${
          presentation.assurance === "provisional" ? " Early estimate." : ""
        }`}
        style={styles.homeCard}
        testID="training-focus-card"
      >
        <View style={styles.homeHeader}>
          <View style={[styles.statusPill, statusPillStyle(styles, content.tone)]}>
            {presentation.phase === "building" ? (
              <ActivityIndicator color={theme.colors.accent.s700} size="small" testID="training-focus-building-indicator" />
            ) : null}
            <Text numberOfLines={1} style={[styles.statusPillText, statusPillTextStyle(styles, content.tone)]}>
              {content.status}
            </Text>
          </View>
          {presentation.assurance === "provisional" ? (
            <Text numberOfLines={1} style={styles.earlyEstimateLabel} testID="training-focus-early-estimate">
              Early estimate
            </Text>
          ) : null}
        </View>
        {primarySignal && taskFamilies.length > 1 ? (
          <Text style={styles.modeLabel} testID="training-focus-primary-mode">
            {taskFamilyLabel(primarySignal.taskFamily)}
          </Text>
        ) : null}
        <AppText variant="headline">{content.title}</AppText>
        <AppText tone="secondary" variant="subheadline">{content.body}</AppText>
        {primarySignal ? (
          <EvidenceLine signal={primarySignal} />
        ) : null}
      </View>
      {canOpen ? (
        <>
          <View style={styles.cardActionSeparator} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.cardAction, pressed ? styles.cardActionPressed : null]}
            testID="training-focus-open-profile"
            onPress={() => presentation.onIntent({ type: "open-profile" })}
          >
            <AppText style={styles.cardActionText} tone="accent" variant="body">
              {homeActionLabel(presentation, recommendationCount)}
            </AppText>
            <Icon color={theme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
          </Pressable>
        </>
      ) : null}
    </Section>
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
      <FlowTopBar
        backLabel="Back to Practice"
        subtitle={taskFamilyLabel(activeTaskFamily)}
        subtitleTestID="tactical-profile-active-mode"
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
      <View style={styles.intro}>
        <AppText accessibilityRole="header" variant="title">
          {profileHeadingFor(presentation, familySignals)}
        </AppText>
        <AppText tone="secondary" variant="subheadline">{profileBodyFor(presentation)}</AppText>
        <AppText tone="secondary" variant="footnote">{profileContextFor(presentation)}</AppText>
      </View>

      {recommendedSignals.length > 0 ? (
        <Section
          header={recommendedSignals.length === 1 ? "Recommended focus" : "Ranked focus"}
          rows
          testID="tactical-profile-recommendations"
        >
          {recommendedSignals.map((signal, index) => (
            <SignalRow
              key={signal.id}
              rank={recommendedSignals.length > 1 ? index + 1 : undefined}
              signal={signal}
              onExplain={() => presentation.onIntent({ type: "explain-signal", signalId: signal.id })}
            />
          ))}
        </Section>
      ) : null}

      {watchSignals.length > 0 ? (
        <Section header="Collecting evidence" rows testID="tactical-profile-watch-signals">
          {watchSignals.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onExplain={() => presentation.onIntent({ type: "explain-signal", signalId: signal.id })}
            />
          ))}
        </Section>
      ) : null}

      {hiddenSignalCount > 0 ? (
        <AppText style={styles.note} testID="tactical-profile-more-signals" tone="secondary" variant="footnote">
          {hiddenSignalCount === 1
            ? "1 more pattern is being monitored in the background."
            : `${hiddenSignalCount} more patterns are being monitored in the background.`}
        </AppText>
      ) : null}

      {recommendedSignals.length > 0 && presentation.focusedRunUnavailable ? (
        <Section header="Focused Run availability" rows testID="focused-run-unavailable">
          <ListRow
            icon="warning"
            iconTone="warning"
            subtitle={presentation.focusedRunUnavailable.body}
            title={presentation.focusedRunUnavailable.title}
          />
        </Section>
      ) : null}

      {canPreview ? (
        <FlowActions
          primaryLabel="Preview focused Run"
          primaryTestID="tactical-profile-preview-run"
          secondaryLabel="Not now"
          secondaryTestID="tactical-profile-not-now"
          onPrimary={() => presentation.onIntent({ type: "preview-focused-run" })}
          onSecondary={() => presentation.onIntent({ type: "suppress-recommendation" })}
        />
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
  const rowStyle = useListRowStyle();
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
  const reasons = [
    {
      title: "What we compared",
      body: `Your results on this theme were compared with similar-difficulty ${taskFamilyComparisonLabel(signal.taskFamily)} in ordinary mixed Runs.`
    },
    {
      title: "Why this is actionable",
      body: "The pattern repeats across different puzzles and sessions, and it is large enough to matter in training."
    },
    {
      title: "What does not decide this",
      body: "Slow and Unclear labels, or whether a puzzle is in Review, do not count as proof of a theme weakness."
    }
  ];

  return (
    <View style={styles.flow} testID="tactical-profile-explanation">
      <FlowTopBar
        backLabel="Back to Tactical Profile"
        title={signal.themeLabel}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <Section>
        <View style={styles.metaLine}>
          <SignalKindBadge kind={signal.kind} />
          <AppText tone="secondary" variant="footnote">{taskFamilyLabel(signal.taskFamily)}</AppText>
        </View>
        <AppText accessibilityRole="header" variant="title">{signalSummary(signal)}</AppText>
        <EvidenceLine signal={signal} variant="flow" />
      </Section>
      <Section rows>
        {reasons.map((reason) => (
          <View key={reason.title} style={[rowStyle, styles.textRow]}>
            <View style={styles.rowCopy}>
              <AppText variant="headline">{reason.title}</AppText>
              <AppText tone="secondary" variant="subheadline">{reason.body}</AppText>
            </View>
          </View>
        ))}
      </Section>
      {canPreview ? (
        <FlowActions
          primaryLabel="Preview focused Run"
          primaryTestID="tactical-profile-explanation-preview"
          secondaryLabel="Not now"
          secondaryTestID="tactical-profile-explanation-not-now"
          onPrimary={() => presentation.onIntent({ type: "preview-focused-run" })}
          onSecondary={() => presentation.onIntent({ type: "suppress-recommendation" })}
        />
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
  const rowStyle = useListRowStyle();
  const preview = presentation.focusedRun;
  if (!preview || preview.taskFamily !== activeTaskFamilyFor(presentation)) {
    return <TacticalProfileScreen presentation={presentation} />;
  }
  const guardrails = [
    focusedRunRatingGuardrail(preview.taskFamily),
    "Recently seen and scheduled Review puzzles avoided",
    "The mix stays fixed after the Run starts",
    "Mixed practice keeps the session broad"
  ];

  return (
    <View style={styles.flow} testID="focused-run-preview">
      <FlowTopBar
        backLabel="Back to Tactical Profile"
        title={preview.title}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <View style={styles.intro}>
        <AppText accessibilityRole="header" variant="title">
          {preview.totalPuzzleCount} puzzles · {preview.durationLabel}
        </AppText>
        <AppText style={styles.semibold} testID="focused-run-rating-anchor" tone="accent" variant="subheadline">
          {preview.ratingLabel}
        </AppText>
      </View>
      <Section header="Training mix">
        <AppText tone="secondary" variant="subheadline">
          Explicit quotas keep one theme from taking over. Only the two clearest focuses can enter one Run.
        </AppText>
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
              <AppText style={styles.allocationLabel} variant="body">{allocation.label}</AppText>
              <AppText numberOfLines={1} tone="secondary" variant="numeralRow">
                {allocation.puzzleCount} · {Math.round(allocation.puzzleCount / preview.totalPuzzleCount * 100)}%
              </AppText>
            </View>
          ))}
        </View>
      </Section>
      <Section header="How puzzles are chosen" rows>
        {guardrails.map((guardrail) => (
          <View key={guardrail} style={rowStyle}>
            <AppText style={styles.rowCopy} variant="body">{guardrail}</AppText>
          </View>
        ))}
      </Section>
      <AppText style={[styles.note, styles.centeredText]} tone="secondary" variant="footnote">
        Later ordinary mixed Runs decide whether this focus still applies. This preview does not change your saved Runs.
      </AppText>
      <FlowActions
        primaryLabel="Start focused Run"
        primaryTestID="focused-run-start"
        secondaryLabel="Not now"
        secondaryTestID="focused-run-not-now"
        onPrimary={() => presentation.onIntent({ type: "start-focused-run" })}
        onSecondary={() => presentation.onIntent({ type: "suppress-recommendation" })}
      />
    </View>
  );
}

function SuppressedRecommendation({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.flow, styles.suppressedFlow]} testID="tactical-profile-suppressed">
      <View style={styles.suppressedHero}>
        <View style={styles.suppressedIcon}>
          <Icon color={theme.colors.text.tertiary} name="check" size={28} weight="semibold" />
        </View>
        <AppText accessibilityRole="header" style={styles.centeredText} variant="title">
          Focus hidden for now
        </AppText>
        <AppText style={styles.centeredText} tone="secondary" variant="body">
          We will keep gathering evidence in mixed Runs without emphasizing this recommendation.
        </AppText>
      </View>
      <EarlyEstimateNotice presentation={presentation} />
      <FlowActions
        primaryLabel="Show recommendation again"
        primaryTestID="tactical-profile-restore"
        secondaryLabel="Back to Practice"
        secondaryTestID="tactical-profile-back-home"
        onPrimary={() => presentation.onIntent({ type: "restore-recommendation" })}
        onSecondary={() => presentation.onIntent({ type: "close-profile" })}
      />
    </View>
  );
}

function SignalRow({
  rank,
  signal,
  onExplain
}: {
  rank?: number;
  signal: TacticalProfileSignal;
  onExplain: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const rowStyle = useListRowStyle();
  return (
    <View style={[rowStyle, styles.textRow]} testID={`tactical-profile-signal-${signal.id}`}>
      <View style={styles.signalCopy}>
        {/* The rank sits beside the name it ranks, centered on the name and
            priority lines, rather than on the whole multi-line item. */}
        <View style={styles.signalTitleRow}>
          {rank ? (
            <View style={styles.rankTile}>
              <AppText numberOfLines={1} style={styles.semibold} tone="accent" variant="subheadline">{rank}</AppText>
            </View>
          ) : null}
          <View style={styles.rowCopy}>
            <AppText variant="headline">{signal.themeLabel}</AppText>
            <AppText tone="secondary" variant="subheadline">{signal.priorityLabel}</AppText>
          </View>
        </View>
        <SignalKindBadge kind={signal.kind} />
        <AppText variant="body">{signalSummary(signal)}</AppText>
        <EvidenceLine signal={signal} variant="flow" />
        <Button
          label="Why this focus?"
          size="compact"
          style={styles.inlineAction}
          testID={`tactical-profile-explain-${signal.id}`}
          variant="plain"
          onPress={onExplain}
        />
      </View>
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
  const uiHaptics = useUiHaptics();
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
            style={({ pressed }) => [
              styles.taskFamilyTab,
              selected ? styles.selectedFill : null,
              pressed && !selected ? styles.pressed : null
            ]}
            testID={`tactical-profile-task-family-${taskFamily}`}
            onPress={() => {
              if (!selected) {
                uiHaptics("selection");
              }
              onSelect(taskFamily);
            }}
          >
            <AppText tone={selected ? "accent" : "primary"} variant="headline">
              {taskFamilyLabel(taskFamily)}
            </AppText>
            <AppText tone="secondary" variant="footnote">
              {TASK_FAMILY_COPY[taskFamily].selectorBody}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function EvidenceLine({
  signal,
  variant = "home"
}: {
  signal: TacticalProfileSignal;
  variant?: "home" | "flow";
}): React.JSX.Element {
  const styles = useStyles();
  const text = `${formatCount(signal.distinctPuzzleCount, "different puzzle", "different puzzles")} · ${formatCount(signal.distinctSessionCount, "session", "sessions")}`;
  if (variant === "flow") {
    return (
      <AppText
        style={styles.semibold}
        testID={`tactical-profile-evidence-${signal.id}`}
        tone="secondary"
        variant="subheadline"
      >
        {text}
      </AppText>
    );
  }
  return (
    <Text style={styles.evidence} testID={`tactical-profile-evidence-${signal.id}`}>
      {text}
    </Text>
  );
}

function SignalKindBadge({
  kind
}: {
  kind: TacticalProfileSignal["kind"];
}): React.JSX.Element {
  return (
    <Badge
      label={kind === "speed"
        ? "Completed-puzzle speed"
        : kind === "both"
          ? "Reliability & speed"
          : "Solve reliability"}
      tone={kind === "speed" ? "warning" : "accent"}
    />
  );
}

// Back chevron and centered title, matching the other direction A sub-screens (#609).
function FlowTopBar({
  backLabel,
  subtitle,
  subtitleTestID,
  title,
  onBack
}: {
  backLabel: string;
  subtitle?: string;
  subtitleTestID?: string;
  title: string;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        hitSlop={4}
        style={({ pressed }) => [styles.topBarButton, pressed ? styles.pressed : null]}
        testID="tactical-profile-back"
        onPress={onBack}
      >
        <Icon color={theme.colors.accent.s600} name="chevronLeft" size={20} weight="semibold" />
      </Pressable>
      <View style={styles.topBarTitleBlock}>
        <AppText accessibilityRole="header" style={styles.centeredText} variant="headline">{title}</AppText>
        {subtitle ? (
          <AppText style={styles.centeredText} testID={subtitleTestID} tone="secondary" variant="footnote">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.topBarButton} />
    </View>
  );
}

function FlowActions({
  primaryLabel,
  primaryTestID,
  secondaryLabel,
  secondaryTestID,
  onPrimary,
  onSecondary
}: {
  primaryLabel: string;
  primaryTestID: string;
  secondaryLabel: string;
  secondaryTestID: string;
  onPrimary: () => void;
  onSecondary: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.flowActions}>
      <Button label={primaryLabel} stretch testID={primaryTestID} onPress={onPrimary} />
      <Button label={secondaryLabel} stretch testID={secondaryTestID} variant="secondary" onPress={onSecondary} />
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
  if (presentation.assurance !== "provisional") {
    return null;
  }
  return (
    <Section rows>
      <ListRow
        icon="warning"
        iconTone="warning"
        subtitle="Use this as a training suggestion while we validate the model with more players."
        testID="tactical-profile-early-estimate"
        title="Early estimate"
      />
    </Section>
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
    ratingGuardrail: "Rebuilt for your current Rating before each new Run"
  },
  arrow_duel: {
    label: "Arrow Duel",
    selectorBody: "Choose between two moves",
    runLabel: "Arrow Duel",
    comparisonLabel: "Arrow Duel choices",
    ratingGuardrail: "Rebuilt for your current Arrow Duel Rating before each new Run"
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
  // Practice Home Training focus card.
  homeCard: {
    gap: theme.spacing.group,
    padding: 16
  },
  homeHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  earlyEstimateLabel: {
    ...theme.typography.footnote,
    color: theme.colors.text.tertiary
  },
  statusPill: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2
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
    ...theme.typography.caption,
    fontWeight: theme.typography.headline.fontWeight
  },
  statusPillTextBlue: {
    color: theme.colors.accent.s600,
    backgroundColor: theme.colors.accent.s100
  },
  statusPillTextGreen: {
    color: theme.colors.positive.s600,
    backgroundColor: theme.colors.success.s100
  },
  statusPillTextAmber: {
    color: theme.colors.warning.s600,
    backgroundColor: theme.colors.warning.s100
  },
  statusPillTextNeutral: {
    color: theme.colors.text.tertiary,
    backgroundColor: theme.colors.surfaceStrong
  },
  modeLabel: {
    color: theme.colors.accent.s600,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  evidence: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  cardActionSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  cardAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between",
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  cardActionText: {
    flex: 1
  },
  cardActionPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  homeSurface: {
    gap: 0,
    padding: 0
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
  // Tactical Profile flow (#609 direction A).
  flow: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 760,
    paddingBottom: 20,
    width: "100%"
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget
  },
  topBarButton: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  topBarTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  pressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  selectedFill: {
    backgroundColor: theme.colors.accent.s100
  },
  semibold: {
    fontWeight: theme.typography.headline.fontWeight
  },
  centeredText: {
    textAlign: "center"
  },
  intro: {
    gap: 4,
    paddingHorizontal: 4
  },
  note: {
    paddingHorizontal: 16
  },
  taskFamilySelector: {
    flexDirection: "row",
    gap: theme.spacing.group
  },
  taskFamilyTab: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.control,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textRow: {
    paddingVertical: 12
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  signalCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 6,
    minWidth: 0
  },
  signalTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  rankTile: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.tile,
    height: theme.metrics.iconTile,
    justifyContent: "center",
    minWidth: theme.metrics.iconTile,
    paddingHorizontal: 4
  },
  // A plain text action aligned with the row copy (the button pads its label by 8).
  inlineAction: {
    marginLeft: -8
  },
  metaLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline
  },
  flowActions: {
    gap: theme.spacing.group
  },
  allocationBar: {
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    gap: 3,
    height: 12,
    marginVertical: 4,
    overflow: "hidden"
  },
  allocationSegment: {
    flexBasis: 0
  },
  allocationList: {
    gap: 4
  },
  allocationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.minTarget
  },
  allocationDot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  allocationLabel: {
    flex: 1,
    minWidth: 0
  },
  suppressedFlow: {
    alignSelf: "center",
    justifyContent: "center",
    maxWidth: 460,
    minHeight: 360
  },
  suppressedHero: {
    alignItems: "center",
    gap: theme.spacing.inline
  },
  suppressedIcon: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 4,
    width: 56
  }
}));
