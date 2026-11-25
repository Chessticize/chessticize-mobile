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
import { type SupportedLocale, translate, useTranslation } from "../i18n/index.ts";

export function TacticalProfileHomeCard({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const primarySignal = homeLeadSignalFor(presentation);
  const content = homeContentFor(presentation, locale, primarySignal);
  const recommendationCount = recommendedThemeLabels(presentation).length;
  const taskFamilies = recommendedTaskFamilies(presentation.signals);
  const canOpen = presentation.phase !== "building";

  return (
    <Section header={t("tacticalProfile.sectionHeader")} surfaceStyle={styles.homeSurface} testID="training-focus-section">
      <View
        accessibilityLabel={t("tacticalProfile.homeCardA11y", {
          title: content.title,
          body: content.body,
          earlyEstimateSuffix: presentation.assurance === "provisional"
            ? t("tacticalProfile.earlyEstimateA11ySuffix")
            : ""
        })}
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
              {t("history.progress.earlyEstimate")}
            </Text>
          ) : null}
        </View>
        {primarySignal && taskFamilies.length > 1 ? (
          <Text style={styles.modeLabel} testID="training-focus-primary-mode">
            {taskFamilyLabel(primarySignal.taskFamily, locale)}
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
              {homeActionLabel(presentation, recommendationCount, locale)}
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
  const { locale, t } = useTranslation();
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
        backLabel={t("sprintResult.backToPractice")}
        subtitle={taskFamilyLabel(activeTaskFamily, locale)}
        subtitleTestID="tactical-profile-active-mode"
        title={t("tacticalProfile.screenTitle")}
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
          {profileHeadingFor(presentation, familySignals, locale)}
        </AppText>
        <AppText tone="secondary" variant="subheadline">{profileBodyFor(presentation, locale)}</AppText>
        <AppText tone="secondary" variant="footnote">{profileContextFor(presentation, locale)}</AppText>
      </View>

      {recommendedSignals.length > 0 ? (
        <Section
          header={recommendedSignals.length === 1
            ? t("tacticalProfile.recommendedFocusHeader")
            : t("tacticalProfile.rankedFocusHeader")}
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
        <Section header={t("tacticalProfile.collectingEvidence")} rows testID="tactical-profile-watch-signals">
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
          {t("tacticalProfile.morePatternsMonitored", { count: hiddenSignalCount })}
        </AppText>
      ) : null}

      {recommendedSignals.length > 0 && presentation.focusedRunUnavailable ? (
        <Section header={t("tacticalProfile.focusedRunAvailabilityHeader")} rows testID="focused-run-unavailable">
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
          primaryLabel={t("tacticalProfile.previewFocusedRun")}
          primaryTestID="tactical-profile-preview-run"
          secondaryLabel={t("common.notNow")}
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
  const { locale, t } = useTranslation();
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
      id: "compared",
      title: t("tacticalProfile.explanation.comparedTitle"),
      body: t("tacticalProfile.explanation.comparedBody", {
        comparison: taskFamilyComparisonLabel(signal.taskFamily, locale)
      })
    },
    {
      id: "actionable",
      title: t("tacticalProfile.explanation.actionableTitle"),
      body: t("tacticalProfile.explanation.actionableBody")
    },
    {
      id: "not-decided",
      title: t("tacticalProfile.explanation.notDecidedTitle"),
      body: t("tacticalProfile.explanation.notDecidedBody")
    }
  ];

  return (
    <View style={styles.flow} testID="tactical-profile-explanation">
      <FlowTopBar
        backLabel={t("tacticalProfile.backToProfile")}
        title={signal.themeLabel}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <Section>
        <View style={styles.metaLine}>
          <SignalKindBadge kind={signal.kind} />
          <AppText tone="secondary" variant="footnote">{taskFamilyLabel(signal.taskFamily, locale)}</AppText>
        </View>
        <AppText accessibilityRole="header" variant="title">{signalSummary(signal, locale)}</AppText>
        <EvidenceLine signal={signal} variant="flow" />
      </Section>
      <Section rows>
        {reasons.map((reason) => (
          <View key={reason.id} style={[rowStyle, styles.textRow]}>
            <View style={styles.rowCopy}>
              <AppText variant="headline">{reason.title}</AppText>
              <AppText tone="secondary" variant="subheadline">{reason.body}</AppText>
            </View>
          </View>
        ))}
      </Section>
      {canPreview ? (
        <FlowActions
          primaryLabel={t("tacticalProfile.previewFocusedRun")}
          primaryTestID="tactical-profile-explanation-preview"
          secondaryLabel={t("common.notNow")}
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
  const { locale, t } = useTranslation();
  const preview = presentation.focusedRun;
  if (!preview || preview.taskFamily !== activeTaskFamilyFor(presentation)) {
    return <TacticalProfileScreen presentation={presentation} />;
  }
  const guardrails = [
    focusedRunRatingGuardrail(preview.taskFamily, locale),
    t("tacticalProfile.focusedRun.guardrailAvoidRecent"),
    t("tacticalProfile.focusedRun.guardrailFixedMix"),
    t("tacticalProfile.focusedRun.guardrailMixedPractice")
  ];

  return (
    <View style={styles.flow} testID="focused-run-preview">
      <FlowTopBar
        backLabel={t("tacticalProfile.backToProfile")}
        title={preview.title}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <EarlyEstimateNotice presentation={presentation} />
      <View style={styles.intro}>
        <AppText accessibilityRole="header" variant="title">
          {t("tacticalProfile.focusedRun.puzzlesAndDuration", {
            count: preview.totalPuzzleCount,
            duration: preview.durationLabel
          })}
        </AppText>
        <AppText style={styles.semibold} testID="focused-run-rating-anchor" tone="accent" variant="subheadline">
          {preview.ratingLabel}
        </AppText>
      </View>
      <Section header={t("tacticalProfile.focusedRun.trainingMixHeader")}>
        <AppText tone="secondary" variant="subheadline">
          {t("tacticalProfile.focusedRun.trainingMixBody")}
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
      <Section header={t("tacticalProfile.focusedRun.howChosenHeader")} rows>
        {guardrails.map((guardrail, index) => (
          <View key={index} style={rowStyle}>
            <AppText style={styles.rowCopy} variant="body">{guardrail}</AppText>
          </View>
        ))}
      </Section>
      <AppText style={[styles.note, styles.centeredText]} tone="secondary" variant="footnote">
        {t("tacticalProfile.focusedRun.footnote")}
      </AppText>
      <FlowActions
        primaryLabel={t("tacticalProfile.focusedRun.startButton")}
        primaryTestID="focused-run-start"
        secondaryLabel={t("common.notNow")}
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
  const { t } = useTranslation();
  return (
    <View style={[styles.flow, styles.suppressedFlow]} testID="tactical-profile-suppressed">
      <View style={styles.suppressedHero}>
        <View style={styles.suppressedIcon}>
          <Icon color={theme.colors.text.tertiary} name="check" size={28} weight="semibold" />
        </View>
        <AppText accessibilityRole="header" style={styles.centeredText} variant="title">
          {t("tacticalProfile.suppressed.title")}
        </AppText>
        <AppText style={styles.centeredText} tone="secondary" variant="body">
          {t("tacticalProfile.suppressed.body")}
        </AppText>
      </View>
      <EarlyEstimateNotice presentation={presentation} />
      <FlowActions
        primaryLabel={t("tacticalProfile.suppressed.restore")}
        primaryTestID="tactical-profile-restore"
        secondaryLabel={t("sprintResult.backToPractice")}
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
  const { locale, t } = useTranslation();
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
        <AppText variant="body">{signalSummary(signal, locale)}</AppText>
        <EvidenceLine signal={signal} variant="flow" />
        <Button
          label={t("tacticalProfile.whyThisFocus")}
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
  const { locale, t } = useTranslation();
  return (
    <View
      accessibilityLabel={t("tacticalProfile.chooseModeA11y")}
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
              {taskFamilyLabel(taskFamily, locale)}
            </AppText>
            <AppText tone="secondary" variant="footnote">
              {taskFamilySelectorBody(taskFamily, locale)}
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
  const { t } = useTranslation();
  const text = `${t("tacticalProfile.differentPuzzlesCount", { count: signal.distinctPuzzleCount })} · ${t("common.sessionsCount", { count: signal.distinctSessionCount })}`;
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
  const { t } = useTranslation();
  return (
    <Badge
      label={kind === "speed"
        ? t("history.progress.signalSpeed")
        : kind === "both"
          ? t("history.progress.signalBoth")
          : t("history.progress.signalSolveRate")}
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

function signalSummary(signal: TacticalProfileSignal, locale: SupportedLocale): string {
  if (signal.kind === "speed") {
    return translate(locale, "tacticalProfile.summary.speed");
  }
  if (signal.kind === "both") {
    return translate(locale, "tacticalProfile.summary.both");
  }
  return translate(locale, "tacticalProfile.summary.solveRate");
}

function profileHeadingFor(
  presentation: TacticalProfilePresentation,
  signals: readonly TacticalProfileSignal[],
  locale: SupportedLocale
): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return translate(locale, "tacticalProfile.heading.unavailable", {
      family: taskFamilyLabel(activeTaskFamilyFor(presentation), locale)
    });
  }
  if (presentation.phase === "balanced") {
    return translate(locale, "history.progress.balancedTitle");
  }
  if (presentation.phase === "collecting") {
    return translate(locale, "history.progress.collectingTitle");
  }
  if (signals.length > 1) {
    return translate(locale, "tacticalProfile.heading.opportunities");
  }
  return signals[0]?.themeLabel ?? translate(locale, "tacticalProfile.heading.fallback");
}

function profileBodyFor(
  presentation: TacticalProfilePresentation,
  locale: SupportedLocale
): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return translate(locale, "tacticalProfile.body.unavailable");
  }
  if (presentation.phase === "balanced") {
    return translate(locale, "tacticalProfile.body.balanced");
  }
  if (presentation.phase === "collecting") {
    return translate(locale, "tacticalProfile.body.collecting");
  }
  return translate(locale, "tacticalProfile.body.ready");
}

function profileContextFor(
  presentation: TacticalProfilePresentation,
  locale: SupportedLocale
): string {
  if (activeTaskFamilyUnavailable(presentation)) {
    return translate(locale, "tacticalProfile.context.unavailable");
  }
  const runLabel = taskFamilyRunLabel(activeTaskFamilyFor(presentation), locale);
  if (presentation.assurance === "provisional") {
    return translate(locale, "tacticalProfile.context.provisional", { runLabel });
  }
  return translate(locale, "tacticalProfile.context.validated", { runLabel });
}

function homeContentFor(
  presentation: TacticalProfilePresentation,
  locale: SupportedLocale,
  primarySignal?: TacticalProfileSignal
): {
  status: string;
  title: string;
  body: string;
  tone: "blue" | "green" | "amber" | "neutral";
} {
  if (presentation.phase === "building") {
    return {
      status: translate(locale, "tacticalProfile.home.buildingStatus"),
      title: translate(locale, "tacticalProfile.home.buildingTitle"),
      body: translate(locale, "tacticalProfile.home.buildingBody"),
      tone: "blue"
    };
  }
  if (allTaskFamiliesUnavailable(presentation)) {
    return {
      status: translate(locale, "tacticalProfile.home.unavailableStatus"),
      title: translate(locale, "tacticalProfile.home.unavailableTitle"),
      body: translate(locale, "tacticalProfile.home.unavailableBody"),
      tone: "neutral"
    };
  }
  if (presentation.phase === "collecting") {
    return {
      status: translate(locale, "tacticalProfile.collectingEvidence"),
      title: translate(locale, "tacticalProfile.home.collectingTitle"),
      body: translate(locale, "tacticalProfile.home.collectingBody"),
      tone: "neutral"
    };
  }
  if (presentation.phase === "balanced") {
    return {
      status: translate(locale, "tacticalProfile.home.balancedStatus"),
      title: translate(locale, "history.progress.balancedTitle"),
      body: translate(locale, "tacticalProfile.home.balancedBody"),
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
      status: translate(locale, "tacticalProfile.home.multiModeStatus", {
        count: taskFamilies.length
      }),
      title: translate(locale, "tacticalProfile.home.clearestFocus", {
        theme: primarySignal.themeLabel
      }),
      body: otherTaskFamily
        ? translate(locale, "tacticalProfile.home.otherFamilyHasRecs", {
            family: taskFamilyLabel(otherTaskFamily, locale),
            recommendations: translate(locale, "tacticalProfile.home.recommendationsCount", {
              count: otherCount
            })
          })
        : translate(locale, "tacticalProfile.home.anotherModeHasRec"),
      tone: "blue"
    };
  }
  const themeLabels = recommendedThemeLabels(presentation);
  if (themeLabels.length > 1 && primarySignal) {
    return {
      status: translate(locale, "tacticalProfile.home.recommendationsCount", {
        count: themeLabels.length
      }),
      title: translate(locale, "tacticalProfile.home.clearestFocus", {
        theme: primarySignal.themeLabel
      }),
      body: secondaryFocusSummary(themeLabels.slice(1), locale),
      tone: "blue"
    };
  }
  return {
    status: translate(locale, "tacticalProfile.home.recommendedStatus"),
    title: primarySignal
      ? translate(locale, "tacticalProfile.home.themeMayNeedAttention", {
          theme: primarySignal.themeLabel
        })
      : translate(locale, "tacticalProfile.home.focusReadyFallback"),
    body: primarySignal
      ? signalSummary(primarySignal, locale)
      : translate(locale, "tacticalProfile.home.reviewEvidenceFallback"),
    tone: "blue"
  };
}

function EarlyEstimateNotice({
  presentation
}: {
  presentation: TacticalProfilePresentation;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (presentation.assurance !== "provisional") {
    return null;
  }
  return (
    <Section rows>
      <ListRow
        icon="warning"
        iconTone="warning"
        subtitle={t("tacticalProfile.earlyEstimateBody")}
        testID="tactical-profile-early-estimate"
        title={t("history.progress.earlyEstimate")}
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

function taskFamilyLabel(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "common.arrowDuel")
    : translate(locale, "history.progress.taskFamilyLine");
}

function taskFamilySelectorBody(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "tacticalProfile.family.arrowDuelSelectorBody")
    : translate(locale, "tacticalProfile.family.lineSelectorBody");
}

function taskFamilyRunLabel(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "common.arrowDuel")
    : translate(locale, "tacticalProfile.family.lineRunLabel");
}

function taskFamilyComparisonLabel(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "tacticalProfile.family.arrowDuelComparisonLabel")
    : translate(locale, "tacticalProfile.family.lineComparisonLabel");
}

function focusedRunRatingGuardrail(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "tacticalProfile.family.arrowDuelRatingGuardrail")
    : translate(locale, "tacticalProfile.family.lineRatingGuardrail");
}

function homeActionLabel(
  presentation: TacticalProfilePresentation,
  recommendationCount: number,
  locale: SupportedLocale
): string {
  if (presentation.phase !== "ready") {
    return translate(locale, "tacticalProfile.action.viewProfile");
  }
  return recommendationCount > 1
    ? translate(locale, "tacticalProfile.action.reviewFocuses")
    : translate(locale, "tacticalProfile.action.reviewFocus");
}

function secondaryFocusSummary(
  themeLabels: readonly string[],
  locale: SupportedLocale
): string {
  if (themeLabels.length === 1) {
    return translate(locale, "tacticalProfile.secondary.one", {
      theme: themeLabels[0]!
    });
  }
  if (themeLabels.length === 2) {
    return translate(locale, "tacticalProfile.secondary.two", {
      first: themeLabels[0]!,
      second: themeLabels[1]!
    });
  }
  return translate(locale, "tacticalProfile.secondary.many", {
    count: themeLabels.length
  });
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
