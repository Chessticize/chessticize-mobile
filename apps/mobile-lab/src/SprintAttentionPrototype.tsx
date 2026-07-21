import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

// Three variants of truthful Sprint results and attention-aware History,
// switchable via ?variant= on one Storybook route.
export const SPRINT_ATTENTION_VARIANTS = [
  { key: "evidence", name: "Evidence first" },
  { key: "ledger", name: "Attempt ledger" },
  { key: "coach", name: "Coach debrief" }
] as const;

type VariantKey = (typeof SPRINT_ATTENTION_VARIANTS)[number]["key"];
type OutcomeState = "completed" | "timed-out";
type Surface = "result" | "history";
type HistoryFilter = "all" | "attention" | "slow" | "timeout" | "wrong" | "unclear" | "review";
type AttemptOutcome = "correct" | "wrong" | "timeout";

type PrototypeAttempt = {
  id: string;
  mode: "Standard" | "Arrow Duel";
  puzzleId: string;
  puzzleRating: number;
  outcome: AttemptOutcome;
  durationSeconds: number;
  slow: boolean;
  unclear: boolean;
  inReview: boolean;
  completedLabel: string;
  context: string;
};

const FILTERS: readonly { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "slow", label: "Slow" },
  { key: "timeout", label: "Timed out" },
  { key: "wrong", label: "Wrong" },
  { key: "unclear", label: "Unclear" },
  { key: "review", label: "In Review" }
] as const;

const HISTORY_ATTEMPTS: readonly PrototypeAttempt[] = [
  {
    id: "timeout-804",
    mode: "Standard",
    puzzleId: "804",
    puzzleRating: 1030,
    outcome: "timeout",
    durationSeconds: 46,
    slow: false,
    unclear: false,
    inReview: false,
    completedLabel: "Today · 11:42 AM",
    context: "Sprint ended while this puzzle was open"
  },
  {
    id: "slow-391",
    mode: "Standard",
    puzzleId: "391",
    puzzleRating: 1010,
    outcome: "correct",
    durationSeconds: 42,
    slow: true,
    unclear: false,
    inReview: false,
    completedLabel: "Today · 11:41 AM",
    context: "Solved above the 30s attention threshold"
  },
  {
    id: "wrong-218",
    mode: "Standard",
    puzzleId: "218",
    puzzleRating: 990,
    outcome: "wrong",
    durationSeconds: 11,
    slow: false,
    unclear: false,
    inReview: true,
    completedLabel: "Today · 9:18 AM",
    context: "Wrong move · Added to Review"
  },
  {
    id: "unclear-127",
    mode: "Arrow Duel",
    puzzleId: "127",
    puzzleRating: 1020,
    outcome: "correct",
    durationSeconds: 8,
    slow: false,
    unclear: true,
    inReview: false,
    completedLabel: "Yesterday · 6:12 PM",
    context: "Solved · You marked the idea unclear"
  },
  {
    id: "correct-563",
    mode: "Standard",
    puzzleId: "563",
    puzzleRating: 980,
    outcome: "correct",
    durationSeconds: 7,
    slow: false,
    unclear: false,
    inReview: false,
    completedLabel: "Yesterday · 6:10 PM",
    context: "Solved within the attention threshold"
  }
] as const;

const COMPLETED_LEDGER: readonly AttemptOutcome[] = [
  "correct", "correct", "correct", "correct", "correct", "correct", "wrong", "correct",
  "correct", "correct", "correct", "correct", "correct", "correct", "correct", "correct"
];

const TIMED_OUT_LEDGER: readonly AttemptOutcome[] = [
  "correct", "correct", "correct", "correct", "wrong", "correct", "correct",
  "correct", "correct", "correct", "correct", "correct", "correct", "timeout"
];

export function SprintAttentionPrototype(): React.JSX.Element {
  const [variant, setVariant] = useState<VariantKey>(() => readVariant());
  const [outcomeState, setOutcomeState] = useState<OutcomeState>(() => readOutcomeState());
  const [surface, setSurface] = useState<Surface>(() => readSurface());
  const [filter, setFilter] = useState<HistoryFilter>(() => readFilter());
  const [reviewIds, setReviewIds] = useState<ReadonlySet<string>>(
    () => new Set(HISTORY_ATTEMPTS.filter((attempt) => attempt.inReview).map((attempt) => attempt.id))
  );
  const [unclearIds, setUnclearIds] = useState<ReadonlySet<string>>(
    () => new Set(HISTORY_ATTEMPTS.filter((attempt) => attempt.unclear).map((attempt) => attempt.id))
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.matches("input, textarea, [contenteditable='true']") || target.isContentEditable
      )) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setVariant((current) => nextVariant(current, direction, updateSearchParam));
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);

  const attempts = useMemo(
    () => HISTORY_ATTEMPTS.map((attempt) => ({
      ...attempt,
      inReview: reviewIds.has(attempt.id),
      unclear: unclearIds.has(attempt.id)
    })),
    [reviewIds, unclearIds]
  );
  const visibleAttempts = useMemo(
    () => attempts.filter((attempt) => attemptMatchesFilter(attempt, filter)),
    [attempts, filter]
  );

  const selectVariant = (next: VariantKey): void => {
    setVariant(next);
    updateSearchParam("variant", next);
  };
  const selectOutcome = (next: OutcomeState): void => {
    setOutcomeState(next);
    updateSearchParam("state", next);
  };
  const selectSurface = (next: Surface): void => {
    setSurface(next);
    updateSearchParam("screen", next);
  };
  const selectFilter = (next: HistoryFilter): void => {
    setFilter(next);
    updateSearchParam("filter", next);
  };
  const toggleReview = (attemptId: string): void => {
    setReviewIds((current) => toggledSet(current, attemptId));
  };
  const toggleUnclear = (attemptId: string): void => {
    setUnclearIds((current) => toggledSet(current, attemptId));
  };

  const sharedHistoryProps: HistoryProps = {
    attempts: visibleAttempts,
    filter,
    onBack: () => selectSurface("result"),
    onFilter: selectFilter,
    onToggleReview: toggleReview,
    onToggleUnclear: toggleUnclear
  };

  return (
    <View style={styles.page} testID="sprint-attention-prototype">
      <View style={styles.phoneFrame}>
        <PrototypeStateBar outcomeState={outcomeState} onSelect={selectOutcome} />
        {surface === "result" ? (
          variant === "evidence" ? (
            <EvidenceResult outcomeState={outcomeState} onOpenHistory={() => selectSurface("history")} />
          ) : variant === "ledger" ? (
            <LedgerResult outcomeState={outcomeState} onOpenHistory={() => selectSurface("history")} />
          ) : (
            <CoachResult outcomeState={outcomeState} onOpenHistory={() => selectSurface("history")} />
          )
        ) : variant === "evidence" ? (
          <EvidenceHistory {...sharedHistoryProps} />
        ) : variant === "ledger" ? (
          <LedgerHistory {...sharedHistoryProps} />
        ) : (
          <CoachHistory {...sharedHistoryProps} />
        )}
      </View>
      <PrototypeSwitcher current={variant} onSelect={selectVariant} />
    </View>
  );
}

function PrototypeStateBar({
  outcomeState,
  onSelect
}: {
  outcomeState: OutcomeState;
  onSelect: (state: OutcomeState) => void;
}): React.JSX.Element {
  return (
    <View style={styles.stateBar} testID="sprint-attention-state-switcher">
      <Text style={styles.stateBarLabel}>PREVIEW STATE</Text>
      <View style={styles.stateBarChoices}>
        <MiniChoice
          active={outcomeState === "completed"}
          label="Completed"
          onPress={() => onSelect("completed")}
          testID="sprint-attention-state-completed"
        />
        <MiniChoice
          active={outcomeState === "timed-out"}
          label="Timed out"
          onPress={() => onSelect("timed-out")}
          testID="sprint-attention-state-timed-out"
        />
      </View>
    </View>
  );
}

function EvidenceResult({
  outcomeState,
  onOpenHistory
}: ResultProps): React.JSX.Element {
  const summary = summaryForState(outcomeState);
  const focus = outcomeState === "timed-out" ? HISTORY_ATTEMPTS[0]! : HISTORY_ATTEMPTS[1]!;
  return (
    <ScrollView contentContainerStyle={styles.content} testID="evidence-result">
      <ScreenHeader eyebrow="Sprint Result" title={summary.title} />
      <View style={styles.evidenceHero}>
        <OutcomeMark state={outcomeState} />
        <View style={styles.evidenceScoreRow}>
          <NumberFact number={summary.solved} label="Solved" emphasis="positive" />
          <View style={styles.verticalDivider} />
          <NumberFact number={summary.attempts} label="Attempts" />
        </View>
        <Text style={styles.heroSupport}>{summary.accuracy}% accuracy · Goal {summary.goal}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What affected this sprint</Text>
        <View style={styles.metricRow}>
          <MetricCard value={String(summary.wrong)} label="Wrong" tone="wrong" />
          <MetricCard value={String(summary.slow)} label="Slow solve" tone="slow" />
          <MetricCard value={String(summary.timeout)} label="Timed out" tone="timeout" />
        </View>
      </View>

      <AttentionDecisionCard attempt={focus} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open attention history"
        onPress={onOpenHistory}
        style={styles.primaryButton}
        testID="evidence-open-history"
      >
        <Text style={styles.primaryButtonText}>View attention history</Text>
      </Pressable>
      <Text style={styles.footnote}>
        Slow, timed out, wrong, and unclear describe an attempt. In Review is a separate study plan.
      </Text>
    </ScrollView>
  );
}

function LedgerResult({
  outcomeState,
  onOpenHistory
}: ResultProps): React.JSX.Element {
  const summary = summaryForState(outcomeState);
  const ledger = outcomeState === "completed" ? COMPLETED_LEDGER : TIMED_OUT_LEDGER;
  return (
    <ScrollView contentContainerStyle={styles.content} testID="ledger-result">
      <ScreenHeader eyebrow="Sprint Result" title="Attempt ledger" />
      <View style={styles.ledgerHeadline}>
        <Text style={styles.ledgerFraction}>{summary.solved}/{summary.attempts}</Text>
        <Text style={styles.ledgerHeadlineLabel}>attempts solved</Text>
        <OutcomePill state={outcomeState} />
      </View>

      <View style={styles.ledgerCard}>
        <View style={styles.ledgerGrid}>
          {ledger.map((outcome, index) => (
            <View key={`${outcome}-${index}`} style={[
              styles.ledgerCell,
              outcome === "correct" ? styles.ledgerCellCorrect : outcome === "wrong" ? styles.ledgerCellWrong : styles.ledgerCellTimeout
            ]}>
              <Text style={styles.ledgerCellIndex}>{index + 1}</Text>
              <Text style={styles.ledgerCellGlyph}>
                {outcome === "correct" ? "✓" : outcome === "wrong" ? "×" : "⌛"}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.legendRow}>
          <LegendDot color="#16A34A" label="Solved" />
          <LegendDot color="#DC2626" label="Wrong" />
          <LegendDot color="#D97706" label="Timed out" />
        </View>
      </View>

      <View style={styles.ledgerStatTable}>
        <LedgerStat label="Solved" value={String(summary.solved)} detail="counts completed puzzles" />
        <LedgerStat label="Attempts" value={String(summary.attempts)} detail="includes wrong and timeout" />
        <LedgerStat label="Slow" value={String(summary.slow)} detail="solved above 30s" />
      </View>

      <View style={styles.planStrip}>
        <View style={styles.planStripCopy}>
          <Text style={styles.cardTitle}>Study plan</Text>
          <Text style={styles.bodyText}>1 wrong attempt is in Review. Slow and timeout attempts still need your decision.</Text>
        </View>
        <Text style={styles.planStripCount}>1</Text>
      </View>

      <Pressable onPress={onOpenHistory} style={styles.outlineButton} testID="ledger-open-history">
        <Text style={styles.outlineButtonText}>Open attempt ledger</Text>
      </Pressable>
    </ScrollView>
  );
}

function CoachResult({
  outcomeState,
  onOpenHistory
}: ResultProps): React.JSX.Element {
  const summary = summaryForState(outcomeState);
  const focus = outcomeState === "timed-out" ? HISTORY_ATTEMPTS[0]! : HISTORY_ATTEMPTS[1]!;
  return (
    <ScrollView contentContainerStyle={styles.content} testID="coach-result">
      <ScreenHeader eyebrow="Sprint Debrief" title={outcomeState === "timed-out" ? "Time ran out" : "Goal reached"} />
      <View style={styles.coachNarrative}>
        <Text style={styles.coachNarrativeTitle}>
          You solved {summary.solved} of {summary.attempts} attempts.
        </Text>
        <Text style={styles.coachNarrativeBody}>
          {outcomeState === "timed-out"
            ? "The open puzzle is recorded as Timed out, not Wrong and not Unclear."
            : "One extra attempt came from a wrong move; the 15 solved puzzles still reached the goal."}
        </Text>
      </View>

      <View style={styles.coachStep}>
        <StepNumber value="1" />
        <View style={styles.coachStepCopy}>
          <Text style={styles.cardTitle}>Outcome</Text>
          <View style={styles.coachFactLine}>
            <Text style={styles.coachFactStrong}>{summary.solved} solved</Text>
            <Text style={styles.bodyText}>from {summary.attempts} total attempts</Text>
          </View>
        </View>
      </View>

      <View style={styles.coachStep}>
        <StepNumber value="2" />
        <View style={styles.coachStepCopy}>
          <Text style={styles.cardTitle}>Attention signals</Text>
          <View style={styles.tagWrap}>
            <SignalTag kind="wrong" label={`${summary.wrong} Wrong`} />
            <SignalTag kind="slow" label={`${summary.slow} Slow`} />
            {summary.timeout > 0 ? <SignalTag kind="timeout" label={`${summary.timeout} Timed out`} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.coachStepFeatured}>
        <StepNumber value="3" />
        <View style={styles.coachStepCopy}>
          <Text style={styles.cardTitle}>Choose what to study</Text>
          <Text style={styles.bodyText}>{focus.context}</Text>
          <View style={styles.decisionLabels}>
            <DecisionStatus label="Review plan" value="Not in Review" />
            <DecisionStatus label="Clarity note" value="Not marked unclear" />
          </View>
        </View>
      </View>

      <Pressable onPress={onOpenHistory} style={styles.primaryButton} testID="coach-open-history">
        <Text style={styles.primaryButtonText}>Decide in History</Text>
      </Pressable>
    </ScrollView>
  );
}

type ResultProps = {
  outcomeState: OutcomeState;
  onOpenHistory: () => void;
};

type HistoryProps = {
  attempts: readonly PrototypeAttempt[];
  filter: HistoryFilter;
  onBack: () => void;
  onFilter: (filter: HistoryFilter) => void;
  onToggleReview: (attemptId: string) => void;
  onToggleUnclear: (attemptId: string) => void;
};

function EvidenceHistory(props: HistoryProps): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.content} testID="evidence-history">
      <HistoryHeader title="History" subtitle="Attempt outcomes and study decisions" onBack={props.onBack} />
      <HistoryFilterStrip filter={props.filter} onFilter={props.onFilter} />
      <SignalSeparationNote />
      <View style={styles.historyList}>
        {props.attempts.map((attempt) => (
          <EvidenceAttemptRow key={attempt.id} attempt={attempt} {...historyActions(props)} />
        ))}
        <EmptyFilterState attempts={props.attempts} />
      </View>
    </ScrollView>
  );
}

function LedgerHistory(props: HistoryProps): React.JSX.Element {
  const currentSprint = props.attempts.filter((attempt) => attempt.completedLabel.startsWith("Today"));
  const earlier = props.attempts.filter((attempt) => !attempt.completedLabel.startsWith("Today"));
  return (
    <ScrollView contentContainerStyle={styles.content} testID="ledger-history">
      <HistoryHeader title="Attempt ledger" subtitle="Grouped by sprint, never by inferred meaning" onBack={props.onBack} />
      <HistoryFilterStrip filter={props.filter} onFilter={props.onFilter} />
      <View style={styles.ledgerHistoryGroup}>
        <LedgerGroupHeader title="Today" meta={`${currentSprint.length} matching attempts`} />
        {currentSprint.map((attempt) => (
          <LedgerAttemptRow key={attempt.id} attempt={attempt} {...historyActions(props)} />
        ))}
      </View>
      {earlier.length > 0 ? (
        <View style={styles.ledgerHistoryGroup}>
          <LedgerGroupHeader title="Yesterday" meta={`${earlier.length} matching attempts`} />
          {earlier.map((attempt) => (
            <LedgerAttemptRow key={attempt.id} attempt={attempt} {...historyActions(props)} />
          ))}
        </View>
      ) : null}
      <EmptyFilterState attempts={props.attempts} />
      <SignalSeparationNote />
    </ScrollView>
  );
}

function CoachHistory(props: HistoryProps): React.JSX.Element {
  const needsDecision = props.attempts.filter((attempt) => !attempt.inReview && (attempt.slow || attempt.outcome === "timeout"));
  const planned = props.attempts.filter((attempt) => attempt.inReview);
  const clarity = props.attempts.filter((attempt) => attempt.unclear && !attempt.inReview);
  const noSignal = props.attempts.filter((attempt) => (
    !attempt.inReview
    && !attempt.unclear
    && !attempt.slow
    && attempt.outcome === "correct"
  ));
  return (
    <ScrollView contentContainerStyle={styles.content} testID="coach-history">
      <HistoryHeader title="Attention inbox" subtitle="Decide what deserves another look" onBack={props.onBack} />
      <HistoryFilterStrip filter={props.filter} onFilter={props.onFilter} />

      <CoachHistorySection
        title="Needs a decision"
        subtitle="Slow and timed-out attempts are surfaced, not auto-labeled unclear."
        attempts={needsDecision}
        {...historyActions(props)}
      />
      <CoachHistorySection
        title="Study plan"
        subtitle="Only attempts explicitly added to Review appear here."
        attempts={planned}
        {...historyActions(props)}
      />
      <CoachHistorySection
        title="Clarity notes"
        subtitle="Unclear is your learning note, independent of Review."
        attempts={clarity}
        {...historyActions(props)}
      />
      <CoachHistorySection
        title="No attention signal"
        subtitle="Ordinary solved attempts remain visible in All history."
        attempts={noSignal}
        {...historyActions(props)}
      />
      <EmptyFilterState attempts={props.attempts} />
    </ScrollView>
  );
}

function historyActions(props: HistoryProps): Pick<HistoryProps, "onToggleReview" | "onToggleUnclear"> {
  return { onToggleReview: props.onToggleReview, onToggleUnclear: props.onToggleUnclear };
}

function EvidenceAttemptRow({
  attempt,
  onToggleReview,
  onToggleUnclear
}: {
  attempt: PrototypeAttempt;
  onToggleReview: (id: string) => void;
  onToggleUnclear: (id: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.attemptCard} testID={`attention-attempt-${attempt.id}`}>
      <View style={styles.attemptTopRow}>
        <OutcomeBadge outcome={attempt.outcome} />
        <View style={styles.attemptCopy}>
          <Text style={styles.cardTitle}>{attempt.mode} · Puzzle {attempt.puzzleId}</Text>
          <Text style={styles.bodyText}>{attempt.puzzleRating} · {attempt.durationSeconds}s · {attempt.completedLabel}</Text>
        </View>
      </View>
      <View style={styles.tagWrap}>
        <AttemptSignalTags attempt={attempt} />
      </View>
      <Text style={styles.attemptContext}>{attempt.context}</Text>
      <DecisionControls attempt={attempt} onToggleReview={onToggleReview} onToggleUnclear={onToggleUnclear} />
    </View>
  );
}

function LedgerAttemptRow({
  attempt,
  onToggleReview,
  onToggleUnclear
}: {
  attempt: PrototypeAttempt;
  onToggleReview: (id: string) => void;
  onToggleUnclear: (id: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.ledgerAttemptRow} testID={`attention-attempt-${attempt.id}`}>
      <OutcomeBadge outcome={attempt.outcome} />
      <View style={styles.ledgerAttemptMain}>
        <View style={styles.ledgerAttemptHeading}>
          <Text style={styles.cardTitle}>#{attempt.puzzleId}</Text>
          <Text style={styles.ledgerAttemptDuration}>{attempt.durationSeconds}s</Text>
        </View>
        <View style={styles.tagWrap}><AttemptSignalTags attempt={attempt} /></View>
        <View style={styles.ledgerDecisionRow}>
          <InlineDecision
            active={attempt.inReview}
            activeLabel="In Review"
            inactiveLabel="Add to Review"
            onPress={() => onToggleReview(attempt.id)}
          />
          <InlineDecision
            active={attempt.unclear}
            activeLabel="Unclear"
            inactiveLabel="Mark unclear"
            onPress={() => onToggleUnclear(attempt.id)}
          />
        </View>
      </View>
    </View>
  );
}

function CoachHistorySection({
  title,
  subtitle,
  attempts,
  onToggleReview,
  onToggleUnclear
}: {
  title: string;
  subtitle: string;
  attempts: readonly PrototypeAttempt[];
  onToggleReview: (id: string) => void;
  onToggleUnclear: (id: string) => void;
}): React.JSX.Element {
  if (attempts.length === 0) return <></>;
  return (
    <View style={styles.coachHistorySection}>
      <View style={styles.coachSectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.bodyText}>{subtitle}</Text>
      </View>
      {attempts.map((attempt) => (
        <View key={attempt.id} style={styles.coachAttemptCard} testID={`attention-attempt-${attempt.id}`}>
          <View style={styles.attemptTopRow}>
            <OutcomeBadge outcome={attempt.outcome} />
            <View style={styles.attemptCopy}>
              <Text style={styles.cardTitle}>{attempt.mode} · #{attempt.puzzleId}</Text>
              <Text style={styles.bodyText}>{attempt.durationSeconds}s · {attempt.completedLabel}</Text>
            </View>
          </View>
          <View style={styles.tagWrap}><AttemptSignalTags attempt={attempt} /></View>
          <DecisionControls attempt={attempt} onToggleReview={onToggleReview} onToggleUnclear={onToggleUnclear} />
        </View>
      ))}
    </View>
  );
}

function HistoryHeader({
  title,
  subtitle,
  onBack
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.historyHeader}>
      <Pressable accessibilityLabel="Back to sprint result" onPress={onBack} style={styles.backButton} testID="attention-history-back">
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <View style={styles.historyHeaderCopy}>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.bodyText}>{subtitle}</Text>
      </View>
    </View>
  );
}

function HistoryFilterStrip({
  filter,
  onFilter
}: {
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
}): React.JSX.Element {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip} testID="attention-history-filters">
      {FILTERS.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityState={{ selected: filter === item.key }}
          onPress={() => onFilter(item.key)}
          style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
          testID={`attention-filter-${item.key}`}
        >
          <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function SignalSeparationNote(): React.JSX.Element {
  return (
    <View style={styles.separationNote}>
      <Text style={styles.separationNoteTitle}>Different signals, separate choices</Text>
      <Text style={styles.separationNoteBody}>
        Slow and Timed out come from time. Wrong is an outcome. Unclear is your note. In Review is your study plan.
      </Text>
    </View>
  );
}

function DecisionControls({
  attempt,
  onToggleReview,
  onToggleUnclear
}: {
  attempt: PrototypeAttempt;
  onToggleReview: (id: string) => void;
  onToggleUnclear: (id: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.decisionControls}>
      <View style={styles.decisionControlRow}>
        <View style={styles.decisionCopy}>
          <Text style={styles.decisionLabel}>Review plan</Text>
          <Text style={styles.decisionValue}>{attempt.inReview ? "In Review" : "Not in Review"}</Text>
        </View>
        <Pressable
          onPress={() => onToggleReview(attempt.id)}
          style={[styles.decisionButton, attempt.inReview && styles.decisionButtonActive]}
          testID={`attention-${attempt.id}-review`}
        >
          <Text style={[styles.decisionButtonText, attempt.inReview && styles.decisionButtonTextActive]}>
            {attempt.inReview ? "Remove" : "Add to Review"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.decisionControlRow}>
        <View style={styles.decisionCopy}>
          <Text style={styles.decisionLabel}>Clarity note</Text>
          <Text style={styles.decisionValue}>{attempt.unclear ? "Marked unclear" : "No unclear mark"}</Text>
        </View>
        <Pressable
          onPress={() => onToggleUnclear(attempt.id)}
          style={[styles.decisionButton, attempt.unclear && styles.decisionButtonUnclear]}
          testID={`attention-${attempt.id}-unclear`}
        >
          <Text style={[styles.decisionButtonText, attempt.unclear && styles.decisionButtonUnclearText]}>
            {attempt.unclear ? "Clear mark" : "Mark unclear"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function InlineDecision({
  active,
  activeLabel,
  inactiveLabel,
  onPress
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.inlineDecision, active && styles.inlineDecisionActive]}>
      <Text style={[styles.inlineDecisionText, active && styles.inlineDecisionTextActive]}>
        {active ? activeLabel : inactiveLabel}
      </Text>
    </Pressable>
  );
}

function AttemptSignalTags({ attempt }: { attempt: PrototypeAttempt }): React.JSX.Element {
  return (
    <>
      {attempt.outcome === "correct" ? <SignalTag kind="correct" label="Solved" /> : null}
      {attempt.outcome === "wrong" ? <SignalTag kind="wrong" label="Wrong" /> : null}
      {attempt.outcome === "timeout" ? <SignalTag kind="timeout" label="Timed out" /> : null}
      {attempt.slow ? <SignalTag kind="slow" label="Slow" /> : null}
      {attempt.unclear ? <SignalTag kind="unclear" label="Unclear" /> : null}
      {attempt.inReview ? <SignalTag kind="review" label="In Review" /> : null}
    </>
  );
}

function OutcomeBadge({ outcome }: { outcome: AttemptOutcome }): React.JSX.Element {
  return (
    <View style={[
      styles.outcomeBadge,
      outcome === "correct" ? styles.outcomeBadgeCorrect : outcome === "wrong" ? styles.outcomeBadgeWrong : styles.outcomeBadgeTimeout
    ]}>
      <Text style={styles.outcomeBadgeText}>{outcome === "correct" ? "✓" : outcome === "wrong" ? "×" : "⌛"}</Text>
    </View>
  );
}

function SignalTag({
  kind,
  label
}: {
  kind: "correct" | "wrong" | "slow" | "timeout" | "unclear" | "review";
  label: string;
}): React.JSX.Element {
  const toneStyle = kind === "correct" ? styles.tagCorrect
    : kind === "wrong" ? styles.tagWrong
      : kind === "slow" ? styles.tagSlow
        : kind === "timeout" ? styles.tagTimeout
          : kind === "unclear" ? styles.tagUnclear
            : styles.tagReview;
  const textStyle = kind === "correct" ? styles.tagTextCorrect
    : kind === "wrong" ? styles.tagTextWrong
      : kind === "slow" ? styles.tagTextSlow
        : kind === "timeout" ? styles.tagTextTimeout
          : kind === "unclear" ? styles.tagTextUnclear
            : styles.tagTextReview;
  return (
    <View style={[styles.tag, toneStyle]}>
      <Text style={[styles.tagText, textStyle]}>{label}</Text>
    </View>
  );
}

function AttentionDecisionCard({ attempt }: { attempt: PrototypeAttempt }): React.JSX.Element {
  return (
    <View style={styles.attentionDecisionCard}>
      <View style={styles.attentionDecisionHeading}>
        <View>
          <Text style={styles.cardEyebrow}>NEEDS A DECISION</Text>
          <Text style={styles.cardTitle}>Puzzle {attempt.puzzleId} · {attempt.durationSeconds}s</Text>
        </View>
        <SignalTag kind={attempt.outcome === "timeout" ? "timeout" : "slow"} label={attempt.outcome === "timeout" ? "Timed out" : "Slow"} />
      </View>
      <Text style={styles.bodyText}>{attempt.context}</Text>
      <View style={styles.decisionLabels}>
        <DecisionStatus label="Review plan" value="Not in Review" />
        <DecisionStatus label="Clarity note" value="Not marked unclear" />
      </View>
    </View>
  );
}

function DecisionStatus({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.decisionStatus}>
      <Text style={styles.decisionLabel}>{label}</Text>
      <Text style={styles.decisionValue}>{value}</Text>
    </View>
  );
}

function OutcomeMark({ state }: { state: OutcomeState }): React.JSX.Element {
  return (
    <View style={styles.outcomeMarkRow}>
      <View style={[styles.outcomeMark, state === "completed" ? styles.outcomeMarkComplete : styles.outcomeMarkTimeout]}>
        <Text style={styles.outcomeMarkGlyph}>{state === "completed" ? "✓" : "⌛"}</Text>
      </View>
      <View>
        <Text style={styles.outcomeMarkTitle}>{state === "completed" ? "Goal reached" : "Time expired"}</Text>
        <Text style={styles.bodyText}>{state === "completed" ? "Standard · 5 minutes" : "Last open puzzle recorded"}</Text>
      </View>
    </View>
  );
}

function OutcomePill({ state }: { state: OutcomeState }): React.JSX.Element {
  return (
    <View style={[styles.outcomePill, state === "completed" ? styles.outcomePillComplete : styles.outcomePillTimeout]}>
      <Text style={[styles.outcomePillText, state === "completed" ? styles.outcomePillTextComplete : styles.outcomePillTextTimeout]}>
        {state === "completed" ? "Goal reached" : "Time expired"}
      </Text>
    </View>
  );
}

function NumberFact({
  number,
  label,
  emphasis
}: {
  number: number;
  label: string;
  emphasis?: "positive";
}): React.JSX.Element {
  return (
    <View style={styles.numberFact}>
      <Text style={[styles.numberFactValue, emphasis === "positive" && styles.positiveText]}>{number}</Text>
      <Text style={styles.numberFactLabel}>{label}</Text>
    </View>
  );
}

function MetricCard({ value, label, tone }: { value: string; label: string; tone: "wrong" | "slow" | "timeout" }): React.JSX.Element {
  return (
    <View style={styles.metricCard}>
      <Text style={[styles.metricValue, tone === "wrong" ? styles.wrongText : styles.attentionText]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function LedgerStat({ label, value, detail }: { label: string; value: string; detail: string }): React.JSX.Element {
  return (
    <View style={styles.ledgerStatRow}>
      <Text style={styles.ledgerStatValue}>{value}</Text>
      <View style={styles.ledgerStatCopy}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={styles.bodyText}>{detail}</Text>
      </View>
    </View>
  );
}

function LedgerGroupHeader({ title, meta }: { title: string; meta: string }): React.JSX.Element {
  return (
    <View style={styles.ledgerGroupHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.bodyText}>{meta}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function StepNumber({ value }: { value: string }): React.JSX.Element {
  return (
    <View style={styles.stepNumber}>
      <Text style={styles.stepNumberText}>{value}</Text>
    </View>
  );
}

function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }): React.JSX.Element {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenEyebrow}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
    </View>
  );
}

function MiniChoice({
  active,
  label,
  onPress,
  testID
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.miniChoice, active && styles.miniChoiceActive]} testID={testID}>
      <Text style={[styles.miniChoiceText, active && styles.miniChoiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyFilterState({ attempts }: { attempts: readonly PrototypeAttempt[] }): React.JSX.Element | null {
  if (attempts.length > 0) return null;
  return (
    <View style={styles.emptyState}>
      <Text style={styles.cardTitle}>No matching attempts</Text>
      <Text style={styles.bodyText}>Choose another signal filter to see the deterministic sample history.</Text>
    </View>
  );
}

function PrototypeSwitcher({
  current,
  onSelect
}: {
  current: VariantKey;
  onSelect: (variant: VariantKey) => void;
}): React.JSX.Element {
  const currentIndex = SPRINT_ATTENTION_VARIANTS.findIndex((variant) => variant.key === current);
  const currentVariant = SPRINT_ATTENTION_VARIANTS[currentIndex]!;
  const cycle = (direction: -1 | 1): void => {
    const nextIndex = (currentIndex + direction + SPRINT_ATTENTION_VARIANTS.length) % SPRINT_ATTENTION_VARIANTS.length;
    onSelect(SPRINT_ATTENTION_VARIANTS[nextIndex]!.key);
  };
  return (
    <div className="sprint-attention-prototype-switcher" aria-label="Sprint attention prototype variants">
      <button type="button" aria-label="Previous design variant" onClick={() => cycle(-1)}>←</button>
      <div className="sprint-attention-prototype-switcher-label">
        <span>LAB PROTOTYPE</span>
        <strong>{currentVariant.key} — {currentVariant.name}</strong>
      </div>
      <button type="button" aria-label="Next design variant" onClick={() => cycle(1)}>→</button>
    </div>
  );
}

function summaryForState(state: OutcomeState): {
  title: string;
  solved: number;
  attempts: number;
  goal: number;
  wrong: number;
  slow: number;
  timeout: number;
  accuracy: number;
} {
  return state === "completed"
    ? { title: "Sprint complete", solved: 15, attempts: 16, goal: 15, wrong: 1, slow: 1, timeout: 0, accuracy: 94 }
    : { title: "Sprint ended", solved: 12, attempts: 14, goal: 15, wrong: 1, slow: 1, timeout: 1, accuracy: 86 };
}

function attemptMatchesFilter(attempt: PrototypeAttempt, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") {
    return attempt.slow || attempt.outcome === "timeout" || attempt.outcome === "wrong" || attempt.unclear;
  }
  if (filter === "slow") return attempt.slow;
  if (filter === "timeout") return attempt.outcome === "timeout";
  if (filter === "wrong") return attempt.outcome === "wrong";
  if (filter === "unclear") return attempt.unclear;
  return attempt.inReview;
}

function toggledSet(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function nextVariant(
  current: VariantKey,
  direction: -1 | 1,
  onChange: (name: string, value: string) => void
): VariantKey {
  const index = SPRINT_ATTENTION_VARIANTS.findIndex((variant) => variant.key === current);
  const nextIndex = (index + direction + SPRINT_ATTENTION_VARIANTS.length) % SPRINT_ATTENTION_VARIANTS.length;
  const next = SPRINT_ATTENTION_VARIANTS[nextIndex]!.key;
  onChange("variant", next);
  return next;
}

function readVariant(): VariantKey {
  const value = readSearchParam("variant");
  return SPRINT_ATTENTION_VARIANTS.some((variant) => variant.key === value) ? value as VariantKey : "evidence";
}

function readOutcomeState(): OutcomeState {
  return readSearchParam("state") === "timed-out" ? "timed-out" : "completed";
}

function readSurface(): Surface {
  return readSearchParam("screen") === "history" ? "history" : "result";
}

function readFilter(): HistoryFilter {
  const value = readSearchParam("filter");
  return FILTERS.some((filter) => filter.key === value) ? value as HistoryFilter : "attention";
}

function readSearchParam(name: string): string | null {
  if (typeof globalThis.location === "undefined") return null;
  return new URLSearchParams(globalThis.location.search).get(name);
}

function updateSearchParam(name: string, value: string): void {
  if (typeof globalThis.location === "undefined" || typeof globalThis.history === "undefined") return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set(name, value);
  globalThis.history.replaceState(null, "", url);
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
    backgroundColor: "#DCE7F5",
    flex: 1,
    justifyContent: "center",
    minHeight: "100%",
    width: "100%"
  },
  phoneFrame: {
    backgroundColor: "#F8FAFC",
    height: "100%",
    maxWidth: 620,
    overflow: "hidden",
    width: "100%"
  },
  stateBar: {
    alignItems: "center",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 5
  },
  stateBarLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  stateBarChoices: {
    flexDirection: "row",
    gap: 5
  },
  miniChoice: {
    borderColor: "#475569",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: 9
  },
  miniChoiceActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF"
  },
  miniChoiceText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "800"
  },
  miniChoiceTextActive: {
    color: "#0F172A"
  },
  content: {
    gap: 14,
    paddingBottom: 112,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  screenHeader: {
    gap: 2
  },
  screenEyebrow: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  screenTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  cardEyebrow: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7
  },
  cardTitle: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  bodyText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17
  },
  evidenceHero: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DBEAFE",
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  outcomeMarkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  outcomeMark: {
    alignItems: "center",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  outcomeMarkComplete: {
    backgroundColor: "#16A34A"
  },
  outcomeMarkTimeout: {
    backgroundColor: "#D97706"
  },
  outcomeMarkGlyph: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900"
  },
  outcomeMarkTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  evidenceScoreRow: {
    alignItems: "stretch",
    flexDirection: "row"
  },
  numberFact: {
    alignItems: "center",
    flex: 1,
    gap: 2
  },
  numberFactValue: {
    color: "#111827",
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 48
  },
  numberFactLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  verticalDivider: {
    backgroundColor: "#E2E8F0",
    width: 1
  },
  heroSupport: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  positiveText: {
    color: "#16A34A"
  },
  wrongText: {
    color: "#DC2626"
  },
  attentionText: {
    color: "#B45309"
  },
  metricRow: {
    flexDirection: "row",
    gap: 8
  },
  metricCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 68,
    padding: 8
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "900"
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center"
  },
  attentionDecisionCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  attentionDecisionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  decisionLabels: {
    flexDirection: "row",
    gap: 8
  },
  decisionStatus: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 7,
    flex: 1,
    gap: 2,
    padding: 8
  },
  decisionLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  decisionValue: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  outlineButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#2563EB",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  outlineButtonText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "900"
  },
  footnote: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center"
  },
  ledgerHeadline: {
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 20
  },
  ledgerFraction: {
    color: "#FFFFFF",
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 52
  },
  ledgerHeadlineLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  outcomePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  outcomePillComplete: {
    backgroundColor: "#DCFCE7"
  },
  outcomePillTimeout: {
    backgroundColor: "#FEF3C7"
  },
  outcomePillText: {
    fontSize: 11,
    fontWeight: "900"
  },
  outcomePillTextComplete: {
    color: "#166534"
  },
  outcomePillTextTimeout: {
    color: "#92400E"
  },
  ledgerCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  ledgerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  ledgerCell: {
    alignItems: "center",
    borderRadius: 7,
    flexBasis: "21%",
    flexGrow: 1,
    minHeight: 42,
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 5
  },
  ledgerCellCorrect: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
    borderWidth: 1
  },
  ledgerCellWrong: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1
  },
  ledgerCellTimeout: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderWidth: 1
  },
  ledgerCellIndex: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900"
  },
  ledgerCellGlyph: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "900"
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  legendDot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  legendText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800"
  },
  ledgerStatTable: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden"
  },
  ledgerStatRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  ledgerStatValue: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    width: 38
  },
  ledgerStatCopy: {
    flex: 1,
    gap: 1
  },
  planStrip: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12
  },
  planStripCopy: {
    flex: 1,
    gap: 2
  },
  planStripCount: {
    color: "#2563EB",
    fontSize: 26,
    fontWeight: "900"
  },
  coachNarrative: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    gap: 8,
    padding: 18
  },
  coachNarrativeTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28
  },
  coachNarrativeBody: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  coachStep: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 2
  },
  coachStepFeatured: {
    alignItems: "flex-start",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12
  },
  coachStepCopy: {
    flex: 1,
    gap: 6,
    paddingTop: 2
  },
  stepNumber: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  coachFactLine: {
    gap: 1
  },
  coachFactStrong: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  historyHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36
  },
  backButtonText: {
    color: "#334155",
    fontSize: 34,
    fontWeight: "500",
    lineHeight: 38
  },
  historyHeaderCopy: {
    flex: 1,
    gap: 1
  },
  filterStrip: {
    gap: 7,
    paddingRight: 4
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 11
  },
  filterChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  filterChipText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  filterChipTextActive: {
    color: "#1D4ED8"
  },
  separationNote: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 10
  },
  separationNoteTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  separationNoteBody: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  historyList: {
    gap: 9
  },
  attemptCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 9,
    borderWidth: 1,
    gap: 9,
    padding: 11
  },
  attemptTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  attemptCopy: {
    flex: 1,
    gap: 2
  },
  outcomeBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  outcomeBadgeCorrect: {
    backgroundColor: "#16A34A"
  },
  outcomeBadgeWrong: {
    backgroundColor: "#DC2626"
  },
  outcomeBadgeTimeout: {
    backgroundColor: "#D97706"
  },
  outcomeBadgeText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  tagText: {
    fontSize: 9,
    fontWeight: "900"
  },
  tagCorrect: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC"
  },
  tagTextCorrect: {
    color: "#166534"
  },
  tagWrong: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5"
  },
  tagTextWrong: {
    color: "#991B1B"
  },
  tagSlow: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74"
  },
  tagTextSlow: {
    color: "#9A3412"
  },
  tagTimeout: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D"
  },
  tagTextTimeout: {
    color: "#92400E"
  },
  tagUnclear: {
    backgroundColor: "#FAF5FF",
    borderColor: "#D8B4FE"
  },
  tagTextUnclear: {
    color: "#7E22CE"
  },
  tagReview: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD"
  },
  tagTextReview: {
    color: "#1D4ED8"
  },
  attemptContext: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  },
  decisionControls: {
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  decisionControlRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  decisionCopy: {
    flex: 1,
    gap: 2
  },
  decisionButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 9
  },
  decisionButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  decisionButtonUnclear: {
    backgroundColor: "#FAF5FF",
    borderColor: "#A855F7"
  },
  decisionButtonText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900"
  },
  decisionButtonTextActive: {
    color: "#1D4ED8"
  },
  decisionButtonUnclearText: {
    color: "#7E22CE"
  },
  ledgerHistoryGroup: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden"
  },
  ledgerGroupHeader: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10
  },
  ledgerAttemptRow: {
    alignItems: "flex-start",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    padding: 11
  },
  ledgerAttemptMain: {
    flex: 1,
    gap: 7
  },
  ledgerAttemptHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  ledgerAttemptDuration: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900"
  },
  ledgerDecisionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  inlineDecision: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  inlineDecisionActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  inlineDecisionText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900"
  },
  inlineDecisionTextActive: {
    color: "#1D4ED8"
  },
  coachHistorySection: {
    gap: 8
  },
  coachSectionHeading: {
    gap: 2
  },
  coachAttemptCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderLeftColor: "#2563EB",
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 11
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 3,
    padding: 16
  }
});
