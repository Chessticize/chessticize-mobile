import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
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
  const primarySignal = presentation.signals[0];
  const content = homeContentFor(presentation, primarySignal);
  const canOpen = presentation.phase !== "building";

  return (
    <View testID="training-focus-section">
      <Text style={styles.sectionLabel}>Training focus</Text>
      <View
        accessibilityLabel={`Training focus. ${content.title}. ${content.body}`}
        style={[styles.homeCard, homeToneStyle(content.tone)]}
        testID="training-focus-card"
      >
        <View style={styles.homeHeader}>
          <View style={[styles.statusPill, statusPillStyle(content.tone)]}>
            {presentation.phase === "building" ? (
              <ActivityIndicator color="#1D4ED8" size="small" testID="training-focus-building-indicator" />
            ) : null}
            <Text style={[styles.statusPillText, statusPillTextStyle(content.tone)]}>
              {content.status}
            </Text>
          </View>
        </View>
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
              {presentation.phase === "ready" ? "Review focus" : "View tactical profile"}
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
  const recommendedSignals = presentation.signals.filter((signal) => signal.status === "recommended");
  const watchSignals = presentation.signals.filter((signal) => signal.status === "watch");
  const canPreview = recommendedSignals.length > 0 && presentation.focusedRun !== undefined;

  return (
    <View style={styles.flow} testID="tactical-profile-screen">
      <FlowHeader
        backLabel="Back to Practice"
        eyebrow="TRAINING FOCUS"
        title="Tactical profile"
        onBack={() => presentation.onIntent({ type: "close-profile" })}
      />
      <View style={styles.contextCard}>
        <Text style={styles.contextTitle}>{profileHeadingFor(presentation)}</Text>
        <Text style={styles.body}>{profileBodyFor(presentation)}</Text>
        <Text style={styles.contextFoot}>
          Based on ordinary mixed Runs. Review and focused Runs do not shape discovery.
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
  const signal = selectedSignalFor(presentation);
  if (!signal) {
    return <TacticalProfileScreen presentation={presentation} />;
  }

  return (
    <View style={styles.flow} testID="tactical-profile-explanation">
      <FlowHeader
        backLabel="Back to Tactical Profile"
        eyebrow="WHY THIS FOCUS"
        title={signal.themeLabel}
        onBack={() => presentation.onIntent({ type: "open-profile" })}
      />
      <View style={styles.explanationHero}>
        <SignalKindPill kind={signal.kind} />
        <Text style={styles.explanationTitle}>{signalSummary(signal)}</Text>
        <EvidenceLine signal={signal} />
      </View>
      <View style={styles.explanationSection}>
        <Text style={styles.sectionTitle}>What we compared</Text>
        <Text style={styles.body}>
          Your results on this theme were compared with puzzles of similar difficulty in ordinary mixed Runs.
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
      {presentation.focusedRun ? (
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
  const preview = presentation.focusedRun;
  if (!preview) {
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
      <Text style={styles.previewSummary}>
        {preview.totalPuzzleCount} puzzles · {preview.durationLabel}
      </Text>
      <View style={styles.allocationCard}>
        <Text style={styles.sectionTitle}>Training mix</Text>
        <Text style={styles.body}>
          Explicit quotas keep one theme from taking over the Run.
        </Text>
        <View style={styles.allocationBar} testID="focused-run-allocation-bar">
          {preview.allocations.map((allocation) => (
            <View
              key={allocation.id}
              style={[
                styles.allocationSegment,
                allocationToneStyle(allocation),
                { flexGrow: allocation.puzzleCount }
              ]}
            />
          ))}
        </View>
        <View style={styles.allocationList}>
          {preview.allocations.map((allocation) => (
            <View key={allocation.id} style={styles.allocationRow}>
              <View style={[styles.allocationDot, allocationToneStyle(allocation)]} />
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
        <Text style={styles.guardrailItem}>• New puzzles near your current Rating</Text>
        <Text style={styles.guardrailItem}>• Recently seen and scheduled Review puzzles avoided</Text>
        <Text style={styles.guardrailItem}>• Mixed puzzles preserved so discovery continues</Text>
      </View>
      <Text style={styles.previewFoot}>This preview does not change your saved Runs.</Text>
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
  return (
    <View style={[styles.flow, styles.suppressedFlow]} testID="tactical-profile-suppressed">
      <View style={styles.suppressedIcon}>
        <Text style={styles.suppressedIconText}>✓</Text>
      </View>
      <Text style={styles.suppressedTitle}>Focus hidden for now</Text>
      <Text style={styles.suppressedBody}>
        We will keep gathering evidence in mixed Runs without emphasizing this recommendation.
      </Text>
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

function EvidenceLine({ signal }: { signal: TacticalProfileSignal }): React.JSX.Element {
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
  return (
    <View style={[styles.kindPill, kind === "speed" ? styles.kindPillSpeed : styles.kindPillSolve]}>
      <Text style={[styles.kindPillText, kind === "speed" ? styles.kindPillTextSpeed : styles.kindPillTextSolve]}>
        {kind === "speed" ? "Completed-puzzle speed" : "Solve reliability"}
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
    ?? presentation.signals[0];
}

function signalSummary(signal: TacticalProfileSignal): string {
  return signal.kind === "speed"
    ? "You solve these correctly, but more slowly than comparable puzzles."
    : "You complete these less reliably than comparable puzzles.";
}

function profileHeadingFor(presentation: TacticalProfilePresentation): string {
  if (presentation.phase === "balanced") {
    return "No meaningful weakness right now";
  }
  if (presentation.phase === "collecting") {
    return "Still collecting evidence";
  }
  if (presentation.phase === "rare_signal") {
    return "One mistake is not a theme weakness";
  }
  if (presentation.signals.length > 1) {
    return "Your clearest training opportunities";
  }
  return presentation.signals[0]?.themeLabel ?? "Your tactical profile";
}

function profileBodyFor(presentation: TacticalProfilePresentation): string {
  if (presentation.phase === "balanced") {
    return "Your recent completed puzzles look balanced after accounting for difficulty and Run settings.";
  }
  if (presentation.phase === "collecting") {
    return "Keep playing mixed Runs. We need results from more different puzzles and sessions before recommending a focus.";
  }
  if (presentation.phase === "rare_signal") {
    return "The individual puzzle can go to Review, but this theme needs more independent evidence before focused training is recommended.";
  }
  return "Recommendations separate evidence, practical impact, and training priority.";
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
  if (presentation.phase === "collecting") {
    return {
      status: "Collecting evidence",
      title: "More variety needed",
      body: "Keep playing mixed Runs so one puzzle or one session cannot decide a training focus.",
      tone: "neutral"
    };
  }
  if (presentation.phase === "balanced") {
    return {
      status: "No focus needed",
      title: "Recent play looks balanced",
      body: "There is no meaningful weakness to emphasize right now.",
      tone: "green"
    };
  }
  if (presentation.phase === "rare_signal") {
    return {
      status: "Collecting evidence",
      title: "One miss is not a theme weakness",
      body: "Review the puzzle now; wait for more puzzles and sessions before focusing the whole theme.",
      tone: "amber"
    };
  }
  return {
    status: "Recommended",
    title: primarySignal ? `${primarySignal.themeLabel} may need attention` : "A training focus is ready",
    body: primarySignal ? signalSummary(primarySignal) : "Review the evidence before choosing focused training.",
    tone: "blue"
  };
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function homeToneStyle(tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.homeCardGreen;
  if (tone === "amber") return styles.homeCardAmber;
  if (tone === "neutral") return styles.homeCardNeutral;
  return styles.homeCardBlue;
}

function statusPillStyle(tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.statusPillGreen;
  if (tone === "amber") return styles.statusPillAmber;
  if (tone === "neutral") return styles.statusPillNeutral;
  return styles.statusPillBlue;
}

function statusPillTextStyle(tone: "blue" | "green" | "amber" | "neutral") {
  if (tone === "green") return styles.statusPillTextGreen;
  if (tone === "amber") return styles.statusPillTextAmber;
  if (tone === "neutral") return styles.statusPillTextNeutral;
  return styles.statusPillTextBlue;
}

function allocationToneStyle(allocation: FocusedRunAllocation) {
  if (allocation.tone === "secondary") return styles.allocationSecondary;
  if (allocation.tone === "mixed") return styles.allocationMixed;
  return styles.allocationPrimary;
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: "#64748B",
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
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE"
  },
  homeCardGreen: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0"
  },
  homeCardAmber: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A"
  },
  homeCardNeutral: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1"
  },
  homeHeader: {
    alignItems: "flex-start"
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
    backgroundColor: "#DBEAFE"
  },
  statusPillGreen: {
    backgroundColor: "#D1FAE5"
  },
  statusPillAmber: {
    backgroundColor: "#FEF3C7"
  },
  statusPillNeutral: {
    backgroundColor: "#E2E8F0"
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800"
  },
  statusPillTextBlue: {
    color: "#1D4ED8"
  },
  statusPillTextGreen: {
    color: "#047857"
  },
  statusPillTextAmber: {
    color: "#92400E"
  },
  statusPillTextNeutral: {
    color: "#475569"
  },
  homeTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  body: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  evidence: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  cardAction: {
    alignItems: "center",
    borderTopColor: "rgba(100, 116, 139, 0.22)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    minHeight: 44,
    paddingTop: 10
  },
  cardActionText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "800"
  },
  cardActionChevron: {
    color: "#1D4ED8",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  backButtonText: {
    color: "#334155",
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2
  },
  flowHeaderCopy: {
    flex: 1
  },
  eyebrow: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2
  },
  flowTitle: {
    color: "#0F172A",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 31
  },
  contextCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  contextTitle: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25
  },
  contextFoot: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18
  },
  signalSection: {
    gap: 10
  },
  signalCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    backgroundColor: "#0F172A",
    borderRadius: 16,
    color: "#FFFFFF",
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
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  priorityLabel: {
    color: "#64748B",
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
    backgroundColor: "#DBEAFE"
  },
  kindPillSpeed: {
    backgroundColor: "#FEF3C7"
  },
  kindPillText: {
    fontSize: 11,
    fontWeight: "800"
  },
  kindPillTextSolve: {
    color: "#1D4ED8"
  },
  kindPillTextSpeed: {
    color: "#92400E"
  },
  signalSummary: {
    color: "#334155",
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
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "800"
  },
  flowActions: {
    gap: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800"
  },
  explanationHero: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 18
  },
  explanationTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 27
  },
  explanationSection: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    gap: 6,
    paddingBottom: 14
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  previewSummary: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700"
  },
  allocationCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    backgroundColor: "#2563EB"
  },
  allocationSecondary: {
    backgroundColor: "#60A5FA"
  },
  allocationMixed: {
    backgroundColor: "#94A3B8"
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
    color: "#334155",
    flex: 1,
    fontSize: 14,
    fontWeight: "700"
  },
  allocationCount: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700"
  },
  previewGuardrails: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  guardrailItem: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  previewFoot: {
    color: "#64748B",
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
    backgroundColor: "#E2E8F0",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  suppressedIconText: {
    color: "#475569",
    fontSize: 26,
    fontWeight: "900"
  },
  suppressedTitle: {
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center"
  },
  suppressedBody: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 460,
    textAlign: "center"
  }
});
