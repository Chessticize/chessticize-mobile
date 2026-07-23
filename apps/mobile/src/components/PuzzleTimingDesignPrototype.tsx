import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";

/**
 * DESIGN-ONLY PROTOTYPE — issues #248, #249, and #250.
 *
 * This presentation slice is intentionally not connected to production
 * navigation, sprint rules, storage, history queries, rating identity,
 * analytics, or native timers. Storybook owns all deterministic state.
 */

export type PuzzleTimingDesignScreen = "policy" | "active" | "history" | "profile";
export type PuzzleTimingDesignPhase = "normal" | "warning" | "timeout";

type AttentionFilter = "attention" | "slow" | "timeout" | "unclear" | "review" | "all";
type AttemptOutcome = "correct" | "wrong" | "timeout";
type PrototypeAttempt = {
  id: string;
  puzzleId: string;
  outcome: AttemptOutcome;
  timing: "on_pace" | "slow" | "timeout";
  timeoutCause?: "puzzle_limit" | "sprint_end";
  elapsedSeconds: number;
  typicalSeconds: number;
  theme: string;
  context: string;
  unclear: boolean;
  inReview: boolean;
};

type ThemeProfile = {
  id: string;
  label: string;
  accuracy: number;
  medianSeconds: number;
  paceRatio: number;
  attempts: number;
  bucket: "focus" | "careful" | "rushed" | "strong" | "building";
};

const ATTEMPTS: readonly PrototypeAttempt[] = [
  {
    id: "slow-fork",
    puzzleId: "#391",
    outcome: "correct",
    timing: "slow",
    elapsedSeconds: 47,
    typicalSeconds: 20,
    theme: "Fork",
    context: "Solved after the 0:40 slow threshold.",
    unclear: false,
    inReview: false
  },
  {
    id: "timeout-pin",
    puzzleId: "#804",
    outcome: "timeout",
    timing: "timeout",
    timeoutCause: "puzzle_limit",
    elapsedSeconds: 60,
    typicalSeconds: 20,
    theme: "Pin",
    context: "Puzzle limit reached at 1:00; the Sprint continued.",
    unclear: false,
    inReview: false
  },
  {
    id: "sprint-ended",
    puzzleId: "#127",
    outcome: "timeout",
    timing: "timeout",
    timeoutCause: "sprint_end",
    elapsedSeconds: 38,
    typicalSeconds: 20,
    theme: "Deflection",
    context: "The Sprint ended while this puzzle was still open.",
    unclear: false,
    inReview: true
  },
  {
    id: "unclear-mate",
    puzzleId: "#266",
    outcome: "correct",
    timing: "on_pace",
    elapsedSeconds: 16,
    typicalSeconds: 20,
    theme: "Mate in 2",
    context: "Solved on pace; you marked the idea unclear.",
    unclear: true,
    inReview: false
  },
  {
    id: "wrong-discovery",
    puzzleId: "#412",
    outcome: "wrong",
    timing: "on_pace",
    elapsedSeconds: 12,
    typicalSeconds: 20,
    theme: "Discovered attack",
    context: "Wrong move submitted before either time threshold.",
    unclear: false,
    inReview: true
  }
] as const;

const THEME_PROFILES: readonly ThemeProfile[] = [
  {
    id: "fork",
    label: "Forks",
    accuracy: 58,
    medianSeconds: 38,
    paceRatio: 1.9,
    attempts: 24,
    bucket: "focus"
  },
  {
    id: "pin",
    label: "Pins",
    accuracy: 82,
    medianSeconds: 31,
    paceRatio: 1.55,
    attempts: 18,
    bucket: "careful"
  },
  {
    id: "deflection",
    label: "Deflection",
    accuracy: 61,
    medianSeconds: 18,
    paceRatio: 0.9,
    attempts: 14,
    bucket: "rushed"
  },
  {
    id: "mate",
    label: "Mate in 2",
    accuracy: 88,
    medianSeconds: 15,
    paceRatio: 0.75,
    attempts: 31,
    bucket: "strong"
  },
  {
    id: "clearance",
    label: "Clearance",
    accuracy: 67,
    medianSeconds: 27,
    paceRatio: 1.35,
    attempts: 5,
    bucket: "building"
  }
] as const;

export function PuzzleTimingDesignPrototype({
  phase = "normal",
  screen
}: {
  phase?: PuzzleTimingDesignPhase;
  screen: PuzzleTimingDesignScreen;
}): React.JSX.Element {
  if (screen === "policy") {
    return <TimingPolicyScreen />;
  }
  if (screen === "history") {
    return <AttentionHistoryScreen />;
  }
  if (screen === "profile") {
    return <TacticalProfileScreen />;
  }
  return <ActiveTimingScreen phase={phase} />;
}

function TimingPolicyScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const typicalSeconds = 20;
  const [warningEnabled, setWarningEnabled] = useState(true);
  const [timeoutEnabled, setTimeoutEnabled] = useState(true);
  const [warningSeconds, setWarningSeconds] = useState(40);
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);

  const changeWarning = (delta: number): void => {
    setWarningSeconds((current) => Math.max(10, Math.min(current + delta, timeoutSeconds - 5)));
  };
  const changeTimeout = (delta: number): void => {
    setTimeoutSeconds((current) => Math.max(warningSeconds + 5, Math.min(current + delta, 180)));
  };

  return (
    <ProductScreen>
      <ScreenHeader
        eyebrow="STANDARD RUN"
        title="Puzzle timing"
        subtitle="Guide attention without creating another ELO."
        backLabel="Run settings"
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, wide ? styles.scrollContentWide : null]}
        showsVerticalScrollIndicator={false}
        testID="timing-policy-screen"
      >
        <View style={[styles.policyColumns, wide ? styles.row : null]}>
          <View style={styles.primaryColumn}>
            <SectionLabel text="Typical time" />
            <View style={styles.typicalCard} testID="timing-typical-time">
              <View style={styles.typicalValueBlock}>
                <Text style={styles.typicalValue}>0:20</Text>
                <Text style={styles.typicalLabel}>CURRENT BASELINE</Text>
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>Personal pace, when it is trustworthy</Text>
                <Text style={styles.bodyCopy}>
                  Start with this Run&apos;s 20 sec pace. After 20 clean solves, use the median
                  correct time and freeze it for the whole Sprint.
                </Text>
              </View>
            </View>

            <SectionLabel text="Thresholds" />
            <TimingRuleCard
              enabled={warningEnabled}
              eyebrow="SLOW WARNING"
              title="Flag a slow solve"
              value={warningSeconds}
              detail={`${formatMultiplier(warningSeconds, typicalSeconds)} typical · add a Slow tag`}
              tone="warning"
              testID="timing-warning-rule"
              onToggle={() => setWarningEnabled((current) => !current)}
              onDecrease={() => changeWarning(-5)}
              onIncrease={() => changeWarning(5)}
            />
            <TimingRuleCard
              enabled={timeoutEnabled}
              eyebrow="PUZZLE TIMEOUT"
              title="Record and move on"
              value={timeoutSeconds}
              detail={`${formatMultiplier(timeoutSeconds, typicalSeconds)} typical · record Timed out`}
              tone="timeout"
              testID="timing-timeout-rule"
              onToggle={() => setTimeoutEnabled((current) => !current)}
              onDecrease={() => changeTimeout(-5)}
              onIncrease={() => changeTimeout(5)}
            />

            <View style={styles.ruleNote} testID="timing-clarity-note">
              <Text style={styles.ruleNoteIcon}>?</Text>
              <View style={styles.flexOne}>
                <Text style={styles.ruleNoteTitle}>Slow is evidence. Unclear is your note.</Text>
                <Text style={styles.ruleNoteBody}>
                  Slow solves are tagged automatically. After a slow solve, ask whether the idea
                  was clear instead of marking it unclear for the player.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.secondaryColumn}>
            <SectionLabel text="Preview" />
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>What this Run will do</Text>
              <ThresholdPreview
                warningEnabled={warningEnabled}
                warningSeconds={warningSeconds}
                timeoutEnabled={timeoutEnabled}
                timeoutSeconds={timeoutSeconds}
              />
              <View style={styles.divider} />
              <PolicyFact label="Sprint limit" value="5:00" />
              <PolicyFact label="Run pace" value="0:20" />
              <PolicyFact label="ELO identity" value="Unchanged" emphasized />
              <Text style={styles.previewFootnote}>
                Turning either threshold off still records active puzzle time for History and
                tactical profile evidence.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <BottomNavigation active="practice" />
    </ProductScreen>
  );
}

function TimingRuleCard({
  detail,
  enabled,
  eyebrow,
  onDecrease,
  onIncrease,
  onToggle,
  testID,
  title,
  tone,
  value
}: {
  detail: string;
  enabled: boolean;
  eyebrow: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onToggle: () => void;
  testID: string;
  title: string;
  tone: "warning" | "timeout";
  value: number;
}): React.JSX.Element {
  return (
    <View style={[styles.ruleCard, !enabled ? styles.ruleCardDisabled : null]} testID={testID}>
      <View style={styles.ruleHeader}>
        <View style={styles.flexOne}>
          <Text style={[styles.cardEyebrow, tone === "timeout" ? styles.timeoutText : styles.warningText]}>
            {eyebrow}
          </Text>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <ToggleControl enabled={enabled} label={`${title} ${enabled ? "on" : "off"}`} onPress={onToggle} />
      </View>
      {enabled ? (
        <>
          <View style={styles.stepperRow}>
            <StepperButton label={`Decrease ${title}`} symbol="−" onPress={onDecrease} />
            <View style={styles.stepperValue}>
              <Text style={styles.stepperValueText}>{formatClock(value)}</Text>
              <Text style={styles.stepperUnit}>ACTIVE TIME</Text>
            </View>
            <StepperButton label={`Increase ${title}`} symbol="+" onPress={onIncrease} />
          </View>
          <Text style={styles.ruleDetail}>{detail}</Text>
        </>
      ) : (
        <Text style={styles.ruleDetail}>Off · no automatic {tone === "warning" ? "Slow tag" : "skip"}</Text>
      )}
    </View>
  );
}

function ThresholdPreview({
  timeoutEnabled,
  timeoutSeconds,
  warningEnabled,
  warningSeconds
}: {
  timeoutEnabled: boolean;
  timeoutSeconds: number;
  warningEnabled: boolean;
  warningSeconds: number;
}): React.JSX.Element {
  const total = Math.max(timeoutEnabled ? timeoutSeconds : 0, warningEnabled ? warningSeconds : 0, 20);
  return (
    <View style={styles.thresholdPreview}>
      <View style={styles.thresholdTrack}>
        <View style={[styles.thresholdTypical, { width: `${Math.min(100, (20 / total) * 100)}%` }]} />
        {warningEnabled ? (
          <View style={[styles.thresholdMarker, styles.thresholdWarningMarker, {
            left: `${Math.min(98, (warningSeconds / total) * 100)}%`
          }]} />
        ) : null}
        {timeoutEnabled ? (
          <View style={[styles.thresholdMarker, styles.thresholdTimeoutMarker, {
            left: `${Math.min(98, (timeoutSeconds / total) * 100)}%`
          }]} />
        ) : null}
      </View>
      <View style={styles.thresholdLabels}>
        <Text style={styles.thresholdLabel}>Typical 0:20</Text>
        <Text style={styles.thresholdLabel}>
          {warningEnabled ? `Slow ${formatClock(warningSeconds)}` : "Slow off"}
        </Text>
        <Text style={styles.thresholdLabel}>
          {timeoutEnabled ? `Timeout ${formatClock(timeoutSeconds)}` : "Timeout off"}
        </Text>
      </View>
    </View>
  );
}

function ActiveTimingScreen({ phase }: { phase: PuzzleTimingDesignPhase }): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const data = activePhaseData(phase);
  return (
    <ProductScreen>
      <View style={styles.activeTopBar}>
        <Text style={styles.activeBack}>×</Text>
        <Text style={styles.activeTitle}>Standard</Text>
        <Text style={styles.activePause}>Ⅱ</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.activeContent, wide ? styles.activeContentWide : null]}
        showsVerticalScrollIndicator={false}
        testID={`timing-active-${phase}`}
      >
        <View style={styles.sprintMetrics}>
          <MetricBlock label="SOLVED" value="4 / 15" />
          <View style={styles.sprintClockBlock} testID="timing-sprint-clock">
            <Text style={styles.metricLabel}>SPRINT</Text>
            <Text style={styles.sprintClock}>{data.sprintRemaining}</Text>
            <Text style={styles.metricHint}>time left</Text>
          </View>
          <MetricBlock label="MISTAKES" value="● ○ ○" />
        </View>

        <View style={[styles.activeWorkspace, wide ? styles.row : null]}>
          <View style={styles.boardColumn}>
            <PuzzlePaceRail phase={phase} />
            <BoardPreview timedOut={phase === "timeout"} />
          </View>
          <View style={styles.sessionSideColumn}>
            <View style={styles.promptCard}>
              <View style={styles.promptIcon}><Text style={styles.promptIconText}>♔</Text></View>
              <View style={styles.flexOne}>
                <Text style={styles.promptTitle}>
                  {phase === "timeout" ? "Moving to the next puzzle" : "Find the best move"}
                </Text>
                <Text style={styles.promptCopy}>
                  {phase === "timeout"
                    ? "This attempt is recorded as Timed out, not Wrong or Unclear."
                    : "White to move · checks, captures, threats"}
                </Text>
              </View>
            </View>

            {phase === "warning" ? (
              <View style={styles.warningFollowUp} testID="timing-warning-message">
                <Text style={styles.warningFollowUpIcon}>!</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.warningFollowUpTitle}>Taking longer than your typical solve</Text>
                  <Text style={styles.warningFollowUpBody}>
                    Keep thinking. If you solve it, History will show Slow and ask whether the idea was clear.
                  </Text>
                </View>
              </View>
            ) : null}

            {phase === "timeout" ? (
              <View style={styles.timeoutReceipt} testID="timing-timeout-receipt">
                <Text style={styles.timeoutReceiptEyebrow}>ATTEMPT RECEIPT</Text>
                <PolicyFact label="Result" value="Timed out" emphasized />
                <PolicyFact label="Active time" value="1:00" />
                <PolicyFact label="Clarity" value="Not inferred" />
                <PolicyFact label="Review" value="Not auto-added" />
              </View>
            ) : (
              <View style={styles.activeHelpCard}>
                <Text style={styles.activeHelpTitle}>One countdown, one pace signal</Text>
                <Text style={styles.activeHelpBody}>
                  Sprint time stays the primary deadline. Puzzle time counts up so both values have different jobs.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ProductScreen>
  );
}

function PuzzlePaceRail({ phase }: { phase: PuzzleTimingDesignPhase }): React.JSX.Element {
  const data = activePhaseData(phase);
  return (
    <View
      accessibilityLabel={`Puzzle elapsed ${data.puzzleElapsed}. ${data.paceMessage}`}
      style={[
        styles.paceRail,
        phase === "warning" ? styles.paceRailWarning : null,
        phase === "timeout" ? styles.paceRailTimeout : null
      ]}
      testID="timing-puzzle-pace"
    >
      <View style={styles.paceRailHeader}>
        <View>
          <Text style={[
            styles.paceRailEyebrow,
            phase === "warning" ? styles.warningText : null,
            phase === "timeout" ? styles.timeoutText : null
          ]}>
            {phase === "normal" ? "PUZZLE PACE" : phase === "warning" ? "! SLOW" : "◷ TIMED OUT"}
          </Text>
          <Text style={styles.paceRailMessage}>{data.paceMessage}</Text>
        </View>
        <View style={styles.puzzleElapsedBlock}>
          <Text style={styles.puzzleElapsed}>{data.puzzleElapsed}</Text>
          <Text style={styles.metricHint}>elapsed</Text>
        </View>
      </View>
      <View style={styles.paceTrack}>
        <View style={[
          styles.paceFill,
          phase === "warning" ? styles.paceFillWarning : null,
          phase === "timeout" ? styles.paceFillTimeout : null,
          { width: `${data.progressPercent}%` }
        ]} />
        <View style={[styles.paceTrackMarker, styles.paceWarningMarker]} />
        <View style={[styles.paceTrackMarker, styles.paceTimeoutMarker]} />
      </View>
      <View style={styles.paceTrackLabels}>
        <Text style={styles.paceTrackLabel}>Start</Text>
        <Text style={styles.paceTrackLabel}>Slow 0:40</Text>
        <Text style={styles.paceTrackLabel}>Timeout 1:00</Text>
      </View>
    </View>
  );
}

function BoardPreview({ timedOut }: { timedOut: boolean }): React.JSX.Element {
  const pieces: Record<number, string> = {
    2: "♜", 6: "♚", 8: "♟", 11: "♟", 13: "♟", 18: "♞", 21: "♟",
    27: "♙", 35: "♕", 42: "♘", 48: "♙", 50: "♙", 53: "♙", 59: "♖", 62: "♔"
  };
  return (
    <View style={styles.boardShell} testID="timing-board-preview">
      <View style={styles.boardGrid}>
        {Array.from({ length: 64 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.boardSquare,
              (Math.floor(index / 8) + index) % 2 === 0 ? styles.boardLight : styles.boardDark
            ]}
          >
            {pieces[index] ? <Text style={styles.boardPiece}>{pieces[index]}</Text> : null}
          </View>
        ))}
        {timedOut ? (
          <View style={styles.boardTimeoutOverlay} testID="timing-board-timeout-overlay">
            <View style={styles.boardTimeoutBadge}>
              <Text style={styles.boardTimeoutIcon}>◷</Text>
              <Text style={styles.boardTimeoutTitle}>Timed out at 1:00</Text>
              <Text style={styles.boardTimeoutCopy}>Next puzzle</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AttentionHistoryScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [filter, setFilter] = useState<AttentionFilter>("attention");
  const [attempts, setAttempts] = useState<readonly PrototypeAttempt[]>(ATTEMPTS);
  const [selectedId, setSelectedId] = useState("slow-fork");
  const filtered = attempts.filter((attempt) => attemptMatchesFilter(attempt, filter));
  const selected = filtered.find((attempt) => attempt.id === selectedId) ?? filtered[0] ?? attempts[0]!;

  const updateAttempt = (id: string, patch: Partial<PrototypeAttempt>): void => {
    setAttempts((current) => current.map((attempt) => attempt.id === id ? { ...attempt, ...patch } : attempt));
  };

  return (
    <ProductScreen>
      <ScreenHeader
        eyebrow="LAST 30 DAYS"
        title="History"
        subtitle="Time evidence and study choices stay separate."
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, wide ? styles.scrollContentWide : null]}
        showsVerticalScrollIndicator={false}
        testID="timing-history-screen"
      >
        <View style={styles.historySummaryRow}>
          <SummaryMetric value="3" label="Need attention" tone="warning" />
          <SummaryMetric value="1" label="Slow solves" tone="warning" />
          <SummaryMetric value="2" label="Timed out" tone="timeout" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}
          testID="timing-history-filters"
        >
          {([
            ["attention", "Needs attention"],
            ["slow", "Slow"],
            ["timeout", "Timed out"],
            ["unclear", "Unclear"],
            ["review", "In Review"],
            ["all", "All"]
          ] as const).map(([key, label]) => (
            <FilterChip
              key={key}
              active={filter === key}
              label={label}
              onPress={() => setFilter(key)}
              testID={`timing-filter-${key}`}
            />
          ))}
        </ScrollView>

        <View style={[styles.historyColumns, wide ? styles.row : null]}>
          <View style={styles.historyListColumn}>
            <View style={styles.separationCard}>
              <Text style={styles.separationTitle}>Slow ≠ Unclear ≠ Review</Text>
              <Text style={styles.separationBody}>
                Slow and Timed out come from active time. Unclear is your learning note.
                In Review is your study plan.
              </Text>
            </View>
            <View style={styles.attemptList}>
              {filtered.length > 0 ? filtered.map((attempt) => (
                <AttemptRow
                  key={attempt.id}
                  attempt={attempt}
                  selected={attempt.id === selected.id}
                  onPress={() => setSelectedId(attempt.id)}
                />
              )) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>No matching attempts</Text>
                  <Text style={styles.bodyCopy}>Choose another signal filter.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.historyDetailColumn}>
            <AttemptDetail
              attempt={selected}
              onToggleReview={() => updateAttempt(selected.id, { inReview: !selected.inReview })}
              onToggleUnclear={() => updateAttempt(selected.id, { unclear: !selected.unclear })}
            />
          </View>
        </View>
      </ScrollView>
      <BottomNavigation active="history" />
    </ProductScreen>
  );
}

function AttemptRow({
  attempt,
  onPress,
  selected
}: {
  attempt: PrototypeAttempt;
  onPress: () => void;
  selected: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${attempt.theme} ${outcomeLabel(attempt.outcome)}, ${attempt.elapsedSeconds} seconds`}
      onPress={onPress}
      style={[styles.attemptRow, selected ? styles.attemptRowSelected : null]}
      testID={`timing-attempt-${attempt.id}`}
    >
      <OutcomeMark outcome={attempt.outcome} />
      <View style={styles.flexOne}>
        <View style={styles.attemptTitleRow}>
          <Text style={styles.attemptTitle}>{attempt.theme} · {attempt.puzzleId}</Text>
          <Text style={styles.attemptDuration}>{formatClock(attempt.elapsedSeconds)}</Text>
        </View>
        <View style={styles.signalRow}>
          <SignalPill kind={attempt.outcome === "timeout" ? "timeout" : attempt.timing === "slow" ? "slow" : attempt.outcome} />
          {attempt.unclear ? <SignalPill kind="unclear" /> : null}
          {attempt.inReview ? <SignalPill kind="review" /> : null}
        </View>
        <Text style={styles.attemptMeta}>{attempt.context}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function AttemptDetail({
  attempt,
  onToggleReview,
  onToggleUnclear
}: {
  attempt: PrototypeAttempt;
  onToggleReview: () => void;
  onToggleUnclear: () => void;
}): React.JSX.Element {
  const ratio = attempt.elapsedSeconds / attempt.typicalSeconds;
  return (
    <View style={styles.detailCard} testID="timing-attempt-detail">
      <Text style={styles.cardEyebrow}>ATTEMPT DETAIL</Text>
      <View style={styles.detailHeading}>
        <OutcomeMark outcome={attempt.outcome} />
        <View style={styles.flexOne}>
          <Text style={styles.detailTitle}>{attempt.theme} · {attempt.puzzleId}</Text>
          <Text style={styles.detailSubtitle}>{outcomeLabel(attempt.outcome)}</Text>
        </View>
      </View>
      <View style={styles.detailMetricGrid}>
        <DetailMetric label="Active time" value={formatClock(attempt.elapsedSeconds)} />
        <DetailMetric label="Typical time" value={formatClock(attempt.typicalSeconds)} />
        <DetailMetric label="Relative pace" value={`${ratio.toFixed(1)}×`} />
        <DetailMetric
          label="Timer cause"
          value={attempt.timeoutCause === "puzzle_limit"
            ? "Puzzle limit"
            : attempt.timeoutCause === "sprint_end"
              ? "Sprint ended"
              : "—"}
        />
      </View>
      <View style={styles.divider} />
      <DecisionRow
        label="Clarity note"
        value={attempt.unclear ? "Marked unclear" : "No unclear mark"}
        action={attempt.unclear ? "Clear mark" : "Mark unclear"}
        tone="unclear"
        onPress={onToggleUnclear}
      />
      <DecisionRow
        label="Review plan"
        value={attempt.inReview ? "In Review" : "Not in Review"}
        action={attempt.inReview ? "Remove" : "Add to Review"}
        tone="review"
        onPress={onToggleReview}
      />
      <Text style={styles.detailFootnote}>
        Timing never silently makes either learning decision.
      </Text>
    </View>
  );
}

function TacticalProfileScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [selectedThemes, setSelectedThemes] = useState<readonly string[]>(["fork", "pin"]);
  const [draftReady, setDraftReady] = useState(false);

  const toggleTheme = (id: string): void => {
    setDraftReady(false);
    setSelectedThemes((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((theme) => theme !== id);
      }
      return [...current, id];
    });
  };
  const selectedProfiles = THEME_PROFILES.filter((profile) => selectedThemes.includes(profile.id));

  return (
    <ProductScreen>
      <ScreenHeader
        eyebrow="STANDARD · LAST 30 DAYS"
        title="Tactical profile"
        subtitle="See accuracy and pace before choosing what to train."
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, wide ? styles.scrollContentWide : null]}
        showsVerticalScrollIndicator={false}
        testID="tactical-profile-screen"
      >
        <View style={[styles.profileHero, wide ? styles.row : null]}>
          <View style={styles.flexOne}>
            <Text style={styles.profileHeroEyebrow}>YOUR CLEAREST SIGNAL</Text>
            <Text style={styles.profileHeroTitle}>Forks need focused work.</Text>
            <Text style={styles.profileHeroCopy}>
              Accuracy is low and correct solves take 1.9× your typical time. Pins are accurate,
              but still deliberate. Those are different training problems.
            </Text>
          </View>
          <View style={styles.profileHeroMetric}>
            <Text style={styles.profileHeroMetricValue}>2</Text>
            <Text style={styles.profileHeroMetricLabel}>focus themes</Text>
          </View>
        </View>

        <View style={[styles.profileColumns, wide ? styles.row : null]}>
          <View style={styles.profileEvidenceColumn}>
            <View style={styles.axisLegend}>
              <Text style={styles.axisLegendTitle}>Two independent axes</Text>
              <View style={styles.axisLegendRow}>
                <Text style={styles.axisLegendLabel}>← lower accuracy</Text>
                <Text style={styles.axisLegendLabel}>higher accuracy →</Text>
              </View>
              <View style={styles.axisLegendTrack}>
                <View style={styles.axisLegendMidpoint} />
              </View>
              <Text style={styles.axisLegendCaption}>Pace is shown inside each card as × typical time.</Text>
            </View>

            <View style={styles.themeGrid}>
              {THEME_PROFILES.map((profile) => (
                <ThemeProfileCard
                  key={profile.id}
                  profile={profile}
                  selected={selectedThemes.includes(profile.id)}
                  onPress={() => toggleTheme(profile.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.profileComposer}>
            <Text style={styles.cardEyebrow}>FOCUS RUN DRAFT</Text>
            <Text style={styles.profileComposerTitle}>Train the evidence</Text>
            <Text style={styles.bodyCopy}>
              Select themes while keeping their reasons visible. The Run can be edited before it is saved.
            </Text>
            <View style={styles.selectedThemeList}>
              {selectedProfiles.map((profile) => (
                <View key={profile.id} style={styles.selectedThemeRow}>
                  <View style={[styles.profileBucketDot, bucketDotStyle(profile.bucket)]} />
                  <View style={styles.flexOne}>
                    <Text style={styles.selectedThemeTitle}>{profile.label}</Text>
                    <Text style={styles.selectedThemeMeta}>
                      {profile.accuracy}% accuracy · {profile.paceRatio.toFixed(2)}× pace
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.composerFacts}>
              <PolicyFact label="Run name" value="Timing focus" />
              <PolicyFact label="Duration" value="5:00" />
              <PolicyFact label="Puzzle timing" value="2× / 3×" />
              <PolicyFact label="ELO" value="Existing Run ELO" emphasized />
            </View>
            {draftReady ? (
              <View style={styles.draftReady} testID="profile-run-draft-ready">
                <Text style={styles.draftReadyTitle}>Run draft ready</Text>
                <Text style={styles.draftReadyCopy}>
                  {selectedProfiles.map((profile) => profile.label).join(" + ")} · review before saving
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setDraftReady(true)}
              style={styles.primaryButton}
              testID="profile-create-focus-run"
            >
              <Text style={styles.primaryButtonText}>Create focus Run</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.methodCard} testID="profile-method-note">
          <Text style={styles.methodTitle}>How the profile avoids false weakness signals</Text>
          <View style={styles.methodGrid}>
            <MethodItem number="1" title="Comparable context" body="Compare within the same Run, mode, and rating band." />
            <MethodItem number="2" title="Robust pace" body="Use median correct active time, not raw average time." />
            <MethodItem number="3" title="Enough evidence" body="Rank at 8+ attempts; otherwise show Building evidence." />
            <MethodItem number="4" title="No hidden score" body="Keep accuracy, pace, timeout rate, and sample size visible." />
          </View>
        </View>
      </ScrollView>
      <BottomNavigation active="history" />
    </ProductScreen>
  );
}

function ThemeProfileCard({
  onPress,
  profile,
  selected
}: {
  onPress: () => void;
  profile: ThemeProfile;
  selected: boolean;
}): React.JSX.Element {
  const bucket = bucketPresentation(profile.bucket);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${profile.label}, ${profile.accuracy}% accuracy, ${profile.paceRatio.toFixed(2)} times typical pace`}
      onPress={onPress}
      style={[
        styles.themeProfileCard,
        bucket.cardStyle,
        selected ? styles.themeProfileCardSelected : null
      ]}
      testID={`profile-theme-${profile.id}`}
    >
      <View style={styles.themeProfileHeader}>
        <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}>
          <Text style={styles.checkboxGlyph}>{selected ? "✓" : ""}</Text>
        </View>
        <SignalPill kind={bucket.pillKind} label={bucket.label} />
      </View>
      <Text style={styles.themeProfileTitle}>{profile.label}</Text>
      <View style={styles.themeProfileMetrics}>
        <View>
          <Text style={styles.themeProfileMetric}>{profile.accuracy}%</Text>
          <Text style={styles.themeProfileMetricLabel}>accuracy</Text>
        </View>
        <View>
          <Text style={styles.themeProfileMetric}>{profile.paceRatio.toFixed(2)}×</Text>
          <Text style={styles.themeProfileMetricLabel}>typical pace</Text>
        </View>
      </View>
      <Text style={styles.themeProfileMeta}>
        {formatClock(profile.medianSeconds)} median · {profile.attempts} attempts
      </Text>
    </Pressable>
  );
}

function ProductScreen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.productScreen}>{children}</View>;
}

function ScreenHeader({
  backLabel,
  eyebrow,
  subtitle,
  title
}: {
  backLabel?: string;
  eyebrow: string;
  subtitle: string;
  title: string;
}): React.JSX.Element {
  return (
    <View style={styles.screenHeader}>
      {backLabel ? <Text style={styles.backLabel}>‹ {backLabel}</Text> : null}
      <Text style={styles.screenEyebrow}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

function BottomNavigation({ active }: { active: "practice" | "history" }): React.JSX.Element {
  return (
    <View style={styles.bottomNavigation}>
      {[
        ["practice", "◆", "Practice"],
        ["review", "↻", "Review"],
        ["history", "▥", "History"],
        ["settings", "⚙", "Settings"]
      ].map(([key, icon, label]) => (
        <View key={key} style={styles.bottomNavigationItem}>
          <Text style={[styles.bottomNavigationIcon, active === key ? styles.bottomNavigationActive : null]}>
            {icon}
          </Text>
          <Text style={[styles.bottomNavigationLabel, active === key ? styles.bottomNavigationActive : null]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ToggleControl({
  enabled,
  label,
  onPress
}: {
  enabled: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.toggleTrack, enabled ? styles.toggleTrackEnabled : null]}
    >
      <View style={[styles.toggleKnob, enabled ? styles.toggleKnobEnabled : null]} />
    </Pressable>
  );
}

function StepperButton({
  label,
  onPress,
  symbol
}: {
  label: string;
  onPress: () => void;
  symbol: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.stepperButton}
    >
      <Text style={styles.stepperButtonText}>{symbol}</Text>
    </Pressable>
  );
}

function PolicyFact({
  emphasized = false,
  label,
  value
}: {
  emphasized?: boolean;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, emphasized ? styles.factValueEmphasized : null]}>{value}</Text>
    </View>
  );
}

function SectionLabel({ text }: { text: string }): React.JSX.Element {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function MetricBlock({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.metricBlock}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SummaryMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: "warning" | "timeout";
  value: string;
}): React.JSX.Element {
  return (
    <View style={[styles.summaryMetric, tone === "timeout" ? styles.summaryMetricTimeout : styles.summaryMetricWarning]}>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
      testID={testID}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function OutcomeMark({ outcome }: { outcome: AttemptOutcome }): React.JSX.Element {
  return (
    <View style={[
      styles.outcomeMark,
      outcome === "correct"
        ? styles.outcomeMarkCorrect
        : outcome === "wrong"
          ? styles.outcomeMarkWrong
          : styles.outcomeMarkTimeout
    ]}>
      <Text style={styles.outcomeMarkText}>{outcome === "correct" ? "✓" : outcome === "wrong" ? "×" : "◷"}</Text>
    </View>
  );
}

function SignalPill({
  kind,
  label
}: {
  kind: "correct" | "wrong" | "slow" | "timeout" | "unclear" | "review" | "building";
  label?: string;
}): React.JSX.Element {
  const presentation = signalPresentation(kind);
  return (
    <View style={[styles.signalPill, presentation.style]}>
      <Text style={[styles.signalPillText, presentation.textStyle]}>{label ?? presentation.label}</Text>
    </View>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.detailMetric}>
      <Text style={styles.detailMetricLabel}>{label}</Text>
      <Text style={styles.detailMetricValue}>{value}</Text>
    </View>
  );
}

function DecisionRow({
  action,
  label,
  onPress,
  tone,
  value
}: {
  action: string;
  label: string;
  onPress: () => void;
  tone: "unclear" | "review";
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.decisionRow}>
      <View style={styles.flexOne}>
        <Text style={styles.decisionLabel}>{label}</Text>
        <Text style={styles.decisionValue}>{value}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.decisionButton, tone === "unclear" ? styles.decisionButtonUnclear : styles.decisionButtonReview]}
      >
        <Text style={styles.decisionButtonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

function MethodItem({
  body,
  number,
  title
}: {
  body: string;
  number: string;
  title: string;
}): React.JSX.Element {
  return (
    <View style={styles.methodItem}>
      <Text style={styles.methodNumber}>{number}</Text>
      <View style={styles.flexOne}>
        <Text style={styles.methodItemTitle}>{title}</Text>
        <Text style={styles.methodItemBody}>{body}</Text>
      </View>
    </View>
  );
}

function activePhaseData(phase: PuzzleTimingDesignPhase): {
  paceMessage: string;
  progressPercent: number;
  puzzleElapsed: string;
  sprintRemaining: string;
} {
  if (phase === "warning") {
    return {
      paceMessage: "13 sec until puzzle timeout",
      progressPercent: 78,
      puzzleElapsed: "0:47",
      sprintRemaining: "2:34"
    };
  }
  if (phase === "timeout") {
    return {
      paceMessage: "Puzzle limit reached",
      progressPercent: 100,
      puzzleElapsed: "1:00",
      sprintRemaining: "2:21"
    };
  }
  return {
    paceMessage: "On pace · warning at 0:40",
    progressPercent: 30,
    puzzleElapsed: "0:18",
    sprintRemaining: "3:42"
  };
}

function attemptMatchesFilter(attempt: PrototypeAttempt, filter: AttentionFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "attention") {
    return attempt.timing === "slow" || attempt.timing === "timeout";
  }
  if (filter === "slow") {
    return attempt.timing === "slow";
  }
  if (filter === "timeout") {
    return attempt.outcome === "timeout";
  }
  if (filter === "unclear") {
    return attempt.unclear;
  }
  return attempt.inReview;
}

function outcomeLabel(outcome: AttemptOutcome): string {
  if (outcome === "correct") {
    return "Solved";
  }
  if (outcome === "wrong") {
    return "Wrong";
  }
  return "Timed out";
}

function signalPresentation(kind: Parameters<typeof SignalPill>[0]["kind"]): {
  label: string;
  style: object;
  textStyle: object;
} {
  if (kind === "correct") {
    return { label: "Solved", style: styles.pillCorrect, textStyle: styles.pillTextCorrect };
  }
  if (kind === "wrong") {
    return { label: "Wrong", style: styles.pillWrong, textStyle: styles.pillTextWrong };
  }
  if (kind === "slow") {
    return { label: "Slow", style: styles.pillSlow, textStyle: styles.pillTextSlow };
  }
  if (kind === "timeout") {
    return { label: "Timed out", style: styles.pillTimeout, textStyle: styles.pillTextTimeout };
  }
  if (kind === "unclear") {
    return { label: "Unclear", style: styles.pillUnclear, textStyle: styles.pillTextUnclear };
  }
  if (kind === "building") {
    return { label: "Building evidence", style: styles.pillBuilding, textStyle: styles.pillTextBuilding };
  }
  return { label: "In Review", style: styles.pillReview, textStyle: styles.pillTextReview };
}

function bucketPresentation(bucket: ThemeProfile["bucket"]): {
  cardStyle: object;
  label: string;
  pillKind: Parameters<typeof SignalPill>[0]["kind"];
} {
  if (bucket === "focus") {
    return { cardStyle: styles.themeFocus, label: "Focus", pillKind: "timeout" };
  }
  if (bucket === "careful") {
    return { cardStyle: styles.themeCareful, label: "Careful", pillKind: "slow" };
  }
  if (bucket === "rushed") {
    return { cardStyle: styles.themeRushed, label: "Rushed", pillKind: "wrong" };
  }
  if (bucket === "strong") {
    return { cardStyle: styles.themeStrong, label: "Strong", pillKind: "correct" };
  }
  return { cardStyle: styles.themeBuilding, label: "Building evidence", pillKind: "building" };
}

function bucketDotStyle(bucket: ThemeProfile["bucket"]): object {
  if (bucket === "focus") {
    return styles.bucketDotFocus;
  }
  if (bucket === "careful") {
    return styles.bucketDotCareful;
  }
  if (bucket === "rushed") {
    return styles.bucketDotRushed;
  }
  if (bucket === "strong") {
    return styles.bucketDotStrong;
  }
  return styles.bucketDotBuilding;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatMultiplier(seconds: number, baselineSeconds: number): string {
  const multiplier = seconds / baselineSeconds;
  return `${Number.isInteger(multiplier) ? multiplier.toFixed(0) : multiplier.toFixed(1)}×`;
}

const styles = StyleSheet.create({
  productScreen: {
    backgroundColor: "#F8FAFC",
    flex: 1,
    minHeight: "100%",
    width: "100%"
  },
  flexOne: {
    flex: 1
  },
  row: {
    flexDirection: "row"
  },
  scrollContent: {
    alignSelf: "center",
    gap: 20,
    maxWidth: 1120,
    paddingBottom: 116,
    paddingHorizontal: 18,
    paddingTop: 8,
    width: "100%"
  },
  scrollContentWide: {
    paddingHorizontal: 38,
    paddingTop: 18
  },
  screenHeader: {
    alignSelf: "center",
    maxWidth: 1120,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    width: "100%"
  },
  backLabel: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 18
  },
  screenEyebrow: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4
  },
  screenTitle: {
    color: "#0F172A",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 6
  },
  screenSubtitle: {
    color: "#64748B",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 5
  },
  policyColumns: {
    gap: 20,
    width: "100%"
  },
  primaryColumn: {
    flex: 1.25,
    gap: 12,
    minWidth: 0
  },
  secondaryColumn: {
    flex: 0.75,
    gap: 12,
    minWidth: 0
  },
  sectionLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
    marginTop: 4,
    textTransform: "uppercase"
  },
  typicalCard: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 18,
    padding: 18
  },
  typicalValueBlock: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DBEAFE",
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 92,
    padding: 12
  },
  typicalValue: {
    color: "#1D4ED8",
    fontSize: 27,
    fontVariant: ["tabular-nums"],
    fontWeight: "900"
  },
  typicalLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginTop: 4
  },
  cardTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800"
  },
  bodyCopy: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5
  },
  ruleCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 18
  },
  ruleCardDisabled: {
    backgroundColor: "#F1F5F9",
    opacity: 0.78
  },
  ruleHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 5
  },
  warningText: {
    color: "#B45309"
  },
  timeoutText: {
    color: "#BE123C"
  },
  toggleTrack: {
    backgroundColor: "#CBD5E1",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 50
  },
  toggleTrackEnabled: {
    backgroundColor: "#2563EB"
  },
  toggleKnob: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 24,
    width: 24
  },
  toggleKnobEnabled: {
    alignSelf: "flex-end"
  },
  stepperRow: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 12
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  stepperButtonText: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "600"
  },
  stepperValue: {
    alignItems: "center",
    minWidth: 110
  },
  stepperValueText: {
    color: "#0F172A",
    fontSize: 31,
    fontVariant: ["tabular-nums"],
    fontWeight: "900"
  },
  stepperUnit: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2
  },
  ruleDetail: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center"
  },
  ruleNote: {
    alignItems: "flex-start",
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15
  },
  ruleNoteIcon: {
    backgroundColor: "#7C3AED",
    borderRadius: 999,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    height: 24,
    lineHeight: 24,
    textAlign: "center",
    width: 24
  },
  ruleNoteTitle: {
    color: "#4C1D95",
    fontSize: 14,
    fontWeight: "800"
  },
  ruleNoteBody: {
    color: "#6D28D9",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  previewCard: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18
  },
  previewTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800"
  },
  previewFootnote: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14
  },
  thresholdPreview: {
    gap: 8,
    marginBottom: 18,
    marginTop: 22
  },
  thresholdTrack: {
    backgroundColor: "#334155",
    borderRadius: 999,
    height: 10,
    position: "relative"
  },
  thresholdTypical: {
    backgroundColor: "#60A5FA",
    borderRadius: 999,
    height: "100%"
  },
  thresholdMarker: {
    borderRadius: 999,
    height: 18,
    marginLeft: -2,
    position: "absolute",
    top: -4,
    width: 4
  },
  thresholdWarningMarker: {
    backgroundColor: "#F59E0B"
  },
  thresholdTimeoutMarker: {
    backgroundColor: "#FB7185"
  },
  thresholdLabels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  thresholdLabel: {
    color: "#CBD5E1",
    fontSize: 9
  },
  divider: {
    backgroundColor: "#CBD5E1",
    height: 1,
    marginVertical: 14
  },
  factRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10
  },
  factLabel: {
    color: "#94A3B8",
    fontSize: 12
  },
  factValue: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700"
  },
  factValueEmphasized: {
    color: "#93C5FD"
  },
  bottomNavigation: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    left: 0,
    paddingBottom: 12,
    paddingTop: 10,
    position: "absolute",
    right: 0
  },
  bottomNavigationItem: {
    alignItems: "center",
    gap: 3,
    minWidth: 58
  },
  bottomNavigationIcon: {
    color: "#94A3B8",
    fontSize: 18
  },
  bottomNavigationLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700"
  },
  bottomNavigationActive: {
    color: "#2563EB"
  },
  activeTopBar: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14
  },
  activeBack: {
    color: "#334155",
    fontSize: 26,
    fontWeight: "400",
    width: 40
  },
  activeTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800"
  },
  activePause: {
    color: "#334155",
    fontSize: 18,
    textAlign: "right",
    width: 40
  },
  activeContent: {
    alignSelf: "center",
    maxWidth: 1080,
    paddingBottom: 40,
    paddingHorizontal: 14,
    paddingTop: 16,
    width: "100%"
  },
  activeContentWide: {
    paddingHorizontal: 34,
    paddingTop: 24
  },
  sprintMetrics: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  metricBlock: {
    alignItems: "center",
    flex: 1
  },
  sprintClockBlock: {
    alignItems: "center",
    borderColor: "#E2E8F0",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    flex: 1.2
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  metricValue: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4
  },
  sprintClock: {
    color: "#0F172A",
    fontSize: 27,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    marginTop: 1
  },
  metricHint: {
    color: "#94A3B8",
    fontSize: 9
  },
  activeWorkspace: {
    alignItems: "flex-start",
    gap: 16
  },
  boardColumn: {
    flex: 1.25,
    gap: 12,
    minWidth: 0,
    width: "100%"
  },
  sessionSideColumn: {
    flex: 0.75,
    gap: 12,
    minWidth: 0,
    width: "100%"
  },
  paceRail: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 15,
    borderWidth: 1,
    padding: 13
  },
  paceRailWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D"
  },
  paceRailTimeout: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FDA4AF"
  },
  paceRailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  paceRailEyebrow: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9
  },
  paceRailMessage: {
    color: "#475569",
    fontSize: 11,
    marginTop: 2
  },
  puzzleElapsedBlock: {
    alignItems: "flex-end"
  },
  puzzleElapsed: {
    color: "#0F172A",
    fontSize: 23,
    fontVariant: ["tabular-nums"],
    fontWeight: "900"
  },
  paceTrack: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    height: 7,
    marginTop: 12,
    overflow: "hidden",
    position: "relative"
  },
  paceFill: {
    backgroundColor: "#3B82F6",
    borderRadius: 999,
    height: "100%"
  },
  paceFillWarning: {
    backgroundColor: "#F59E0B"
  },
  paceFillTimeout: {
    backgroundColor: "#E11D48"
  },
  paceTrackMarker: {
    backgroundColor: "#FFFFFF",
    height: "100%",
    position: "absolute",
    top: 0,
    width: 2
  },
  paceWarningMarker: {
    left: "66.6%"
  },
  paceTimeoutMarker: {
    right: 0
  },
  paceTrackLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5
  },
  paceTrackLabel: {
    color: "#64748B",
    fontSize: 8
  },
  boardShell: {
    alignItems: "center",
    width: "100%"
  },
  boardGrid: {
    aspectRatio: 1,
    backgroundColor: "#CBD5E1",
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 580,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  boardSquare: {
    alignItems: "center",
    aspectRatio: 1,
    justifyContent: "center",
    width: "12.5%"
  },
  boardLight: {
    backgroundColor: "#E8EEF7"
  },
  boardDark: {
    backgroundColor: "#6D8DB6"
  },
  boardPiece: {
    color: "#0F172A",
    fontSize: 27
  },
  boardTimeoutOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.55)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  boardTimeoutBadge: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 18
  },
  boardTimeoutIcon: {
    color: "#E11D48",
    fontSize: 26
  },
  boardTimeoutTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 7
  },
  boardTimeoutCopy: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3
  },
  promptCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15
  },
  promptIcon: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 13,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  promptIconText: {
    color: "#1D4ED8",
    fontSize: 28
  },
  promptTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800"
  },
  promptCopy: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  warningFollowUp: {
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14
  },
  warningFollowUpIcon: {
    backgroundColor: "#F59E0B",
    borderRadius: 999,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    height: 22,
    lineHeight: 22,
    textAlign: "center",
    width: 22
  },
  warningFollowUpTitle: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "800"
  },
  warningFollowUpBody: {
    color: "#A16207",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  timeoutReceipt: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16
  },
  timeoutReceiptEyebrow: {
    color: "#FDA4AF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1
  },
  activeHelpCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 15
  },
  activeHelpTitle: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "800"
  },
  activeHelpBody: {
    color: "#1D4ED8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  },
  historySummaryRow: {
    flexDirection: "row",
    gap: 10
  },
  summaryMetric: {
    borderRadius: 14,
    flex: 1,
    minWidth: 0,
    padding: 13
  },
  summaryMetricWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1
  },
  summaryMetricTimeout: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
    borderWidth: 1
  },
  summaryMetricValue: {
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "900"
  },
  summaryMetricLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3
  },
  filterStrip: {
    gap: 8,
    paddingVertical: 2
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  filterChipActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A"
  },
  filterChipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: "#FFFFFF"
  },
  historyColumns: {
    alignItems: "flex-start",
    gap: 18
  },
  historyListColumn: {
    flex: 1.2,
    gap: 12,
    minWidth: 0,
    width: "100%"
  },
  historyDetailColumn: {
    flex: 0.8,
    minWidth: 0,
    width: "100%"
  },
  separationCard: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
    borderRadius: 15,
    borderWidth: 1,
    padding: 14
  },
  separationTitle: {
    color: "#4C1D95",
    fontSize: 13,
    fontWeight: "800"
  },
  separationBody: {
    color: "#6D28D9",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  attemptList: {
    gap: 9
  },
  attemptRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13
  },
  attemptRowSelected: {
    borderColor: "#2563EB",
    borderWidth: 2
  },
  outcomeMark: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  outcomeMarkCorrect: {
    backgroundColor: "#DCFCE7"
  },
  outcomeMarkWrong: {
    backgroundColor: "#FEE2E2"
  },
  outcomeMarkTimeout: {
    backgroundColor: "#FFE4E6"
  },
  outcomeMarkText: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  attemptTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  attemptTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800"
  },
  attemptDuration: {
    color: "#334155",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "800"
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 5
  },
  signalPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  signalPillText: {
    fontSize: 9,
    fontWeight: "800"
  },
  pillCorrect: {
    backgroundColor: "#DCFCE7"
  },
  pillTextCorrect: {
    color: "#166534"
  },
  pillWrong: {
    backgroundColor: "#FEE2E2"
  },
  pillTextWrong: {
    color: "#991B1B"
  },
  pillSlow: {
    backgroundColor: "#FEF3C7"
  },
  pillTextSlow: {
    color: "#92400E"
  },
  pillTimeout: {
    backgroundColor: "#FFE4E6"
  },
  pillTextTimeout: {
    color: "#9F1239"
  },
  pillUnclear: {
    backgroundColor: "#EDE9FE"
  },
  pillTextUnclear: {
    color: "#5B21B6"
  },
  pillReview: {
    backgroundColor: "#DBEAFE"
  },
  pillTextReview: {
    color: "#1E40AF"
  },
  pillBuilding: {
    backgroundColor: "#E2E8F0"
  },
  pillTextBuilding: {
    color: "#475569"
  },
  attemptMeta: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5
  },
  chevron: {
    color: "#94A3B8",
    fontSize: 24
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 24
  },
  detailCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18
  },
  detailHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    marginTop: 10
  },
  detailTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  detailSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2
  },
  detailMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16
  },
  detailMetric: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    minWidth: "46%",
    padding: 11
  },
  detailMetricLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700"
  },
  detailMetricValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4
  },
  decisionRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 13
  },
  decisionLabel: {
    color: "#64748B",
    fontSize: 10
  },
  decisionValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2
  },
  decisionButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  decisionButtonUnclear: {
    backgroundColor: "#EDE9FE"
  },
  decisionButtonReview: {
    backgroundColor: "#DBEAFE"
  },
  decisionButtonText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800"
  },
  detailFootnote: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 12
  },
  profileHero: {
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 20,
    gap: 20,
    padding: 22
  },
  profileHeroEyebrow: {
    color: "#93C5FD",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1
  },
  profileHeroTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 5
  },
  profileHeroCopy: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7
  },
  profileHeroMetric: {
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    minWidth: 120,
    padding: 16
  },
  profileHeroMetricValue: {
    color: "#FBBF24",
    fontSize: 38,
    fontWeight: "900"
  },
  profileHeroMetricLabel: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700"
  },
  profileColumns: {
    alignItems: "flex-start",
    gap: 18
  },
  profileEvidenceColumn: {
    flex: 1.3,
    gap: 12,
    minWidth: 0,
    width: "100%"
  },
  profileComposer: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    flex: 0.7,
    minWidth: 0,
    padding: 18,
    width: "100%"
  },
  axisLegend: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 15,
    borderWidth: 1,
    padding: 14
  },
  axisLegendTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800"
  },
  axisLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10
  },
  axisLegendLabel: {
    color: "#64748B",
    fontSize: 9
  },
  axisLegendTrack: {
    backgroundColor: "#BFDBFE",
    height: 5,
    marginTop: 5,
    position: "relative"
  },
  axisLegendMidpoint: {
    backgroundColor: "#2563EB",
    height: 11,
    left: "50%",
    marginTop: -3,
    position: "absolute",
    width: 2
  },
  axisLegendCaption: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 9
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  themeProfileCard: {
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 210,
    padding: 14,
    width: "48%"
  },
  themeProfileCardSelected: {
    borderColor: "#2563EB",
    borderWidth: 2
  },
  themeFocus: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3"
  },
  themeCareful: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A"
  },
  themeRushed: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA"
  },
  themeStrong: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0"
  },
  themeBuilding: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0"
  },
  themeProfileHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#94A3B8",
    borderRadius: 5,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20
  },
  checkboxSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  checkboxGlyph: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  themeProfileTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12
  },
  themeProfileMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14
  },
  themeProfileMetric: {
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "900"
  },
  themeProfileMetricLabel: {
    color: "#64748B",
    fontSize: 9
  },
  themeProfileMeta: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 11
  },
  profileComposerTitle: {
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "900"
  },
  selectedThemeList: {
    gap: 8,
    marginTop: 16
  },
  selectedThemeRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 11
  },
  profileBucketDot: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  bucketDotFocus: {
    backgroundColor: "#E11D48"
  },
  bucketDotCareful: {
    backgroundColor: "#F59E0B"
  },
  bucketDotRushed: {
    backgroundColor: "#F97316"
  },
  bucketDotStrong: {
    backgroundColor: "#16A34A"
  },
  bucketDotBuilding: {
    backgroundColor: "#94A3B8"
  },
  selectedThemeTitle: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800"
  },
  selectedThemeMeta: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 2
  },
  composerFacts: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    marginTop: 15,
    padding: 13
  },
  draftReady: {
    backgroundColor: "#DCFCE7",
    borderRadius: 12,
    marginTop: 13,
    padding: 12
  },
  draftReadyTitle: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800"
  },
  draftReadyCopy: {
    color: "#15803D",
    fontSize: 10,
    marginTop: 2
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 12,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800"
  },
  methodCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18
  },
  methodTitle: {
    color: "#1E3A8A",
    fontSize: 16,
    fontWeight: "900"
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 13
  },
  methodItem: {
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 9,
    minWidth: 210,
    padding: 12,
    width: "48%"
  },
  methodNumber: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "900",
    height: 21,
    lineHeight: 21,
    textAlign: "center",
    width: 21
  },
  methodItemTitle: {
    color: "#1E3A8A",
    fontSize: 11,
    fontWeight: "800"
  },
  methodItemBody: {
    color: "#475569",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2
  }
});
