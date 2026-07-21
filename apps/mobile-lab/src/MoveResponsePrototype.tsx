import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import BoardPlaceholder from "./BoardPlaceholder.tsx";
import {
  PrototypeVariantSwitcher,
  type PrototypeVariant
} from "./PrototypeVariantSwitcher.tsx";

// Three variants of the move-response contract, switchable via `?variant=`,
// in the existing Practice area of the Interaction Lab.

type VariantKey = "A" | "B" | "C";
type ResponsePhase = "ready" | "accepted" | "feedback" | "ignored" | "next-ready";

type PhaseDefinition = {
  badge: string;
  detail: string;
  headline: string;
  input: "locked" | "ready";
  time: string;
  tone: "calm" | "good" | "warn";
};

const VARIANTS: readonly PrototypeVariant[] = [
  { key: "A", label: "Response rail" },
  { key: "B", label: "Move receipt" },
  { key: "C", label: "Board pulse" }
] as const;

const PHASES: Record<ResponsePhase, PhaseDefinition> = {
  ready: {
    badge: "INPUT READY",
    detail: "The response clock starts only after the board accepts the move.",
    headline: "Make the first move",
    input: "ready",
    time: "Before move",
    tone: "calm"
  },
  accepted: {
    badge: "ACCEPTED",
    detail: "The move is committed and board input locks immediately.",
    headline: "Move received",
    input: "locked",
    time: "0 ms",
    tone: "good"
  },
  feedback: {
    badge: "FEEDBACK",
    detail: "Visible confirmation remains present whether sound and haptics are on or off.",
    headline: "Correct",
    input: "locked",
    time: "80 ms",
    tone: "good"
  },
  ignored: {
    badge: "TAP IGNORED",
    detail: "An early second tap does not move a piece; the locked state explains why.",
    headline: "Still processing",
    input: "locked",
    time: "90 ms",
    tone: "warn"
  },
  "next-ready": {
    badge: "NEXT MOVE READY",
    detail: "The board unlocks only when the next position can accept input.",
    headline: "Your move",
    input: "ready",
    time: "180 ms",
    tone: "calm"
  }
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_FIRST_MOVE_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

export function MoveResponsePrototype(): React.JSX.Element {
  const { height, width } = useWindowDimensions();
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [phase, setPhase] = useState<ResponsePhase>(readPhase);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const definition = PHASES[phase];
  const boardSize = Math.floor(Math.max(176, Math.min(324, width - 36, height * 0.48)));

  function chooseVariant(nextVariant: string): void {
    if (!isVariantKey(nextVariant)) {
      return;
    }
    setVariant(nextVariant);
    replaceQueryParameter("variant", nextVariant);
  }

  function choosePhase(nextPhase: ResponsePhase): void {
    setPhase(nextPhase);
    replaceQueryParameter("state", nextPhase);
  }

  const sharedProps: VariantProps = {
    boardSize,
    definition,
    hapticsEnabled,
    onHapticsChange: setHapticsEnabled,
    onPhaseChange: choosePhase,
    onSoundChange: setSoundEnabled,
    phase,
    soundEnabled
  };

  return (
    <View style={styles.shell} testID="move-response-prototype">
      {variant === "A" ? <ResponseRailVariant {...sharedProps} /> : null}
      {variant === "B" ? <MoveReceiptVariant {...sharedProps} compact={width < 760} /> : null}
      {variant === "C" ? <BoardPulseVariant {...sharedProps} /> : null}
      <PrototypeVariantSwitcher current={variant} onChange={chooseVariant} variants={VARIANTS} />
    </View>
  );
}

type VariantProps = {
  boardSize: number;
  definition: PhaseDefinition;
  hapticsEnabled: boolean;
  onHapticsChange: (enabled: boolean) => void;
  onPhaseChange: (phase: ResponsePhase) => void;
  onSoundChange: (enabled: boolean) => void;
  phase: ResponsePhase;
  soundEnabled: boolean;
};

function ResponseRailVariant(props: VariantProps): React.JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={styles.railPage}
      style={styles.scroll}
      testID="move-response-variant-a"
    >
      <PrototypeHeader
        kicker="A · RESPONSE RAIL"
        summary="Keep the board central and make the response contract a short, glanceable sequence."
        title="Play without wondering if the tap landed"
      />
      <VisibleFeedback definition={props.definition} />
      <BoardStage {...props} />
      <View style={styles.signalRail}>
        <SignalCell label="1 · Input" value={props.definition.input === "ready" ? "Accepting taps" : "Locked"} />
        <SignalCell label="2 · Feedback" value={feedbackChannelLabel(props.phase)} />
        <SignalCell label="3 · Next move" value={props.phase === "next-ready" ? "Ready now" : "Waiting"} />
      </View>
      <PreferenceRow {...props} />
      <StateScrubber onChange={props.onPhaseChange} phase={props.phase} />
      <NativeBoundaryNote />
    </ScrollView>
  );
}

function MoveReceiptVariant(props: VariantProps & { compact: boolean }): React.JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={styles.receiptPage}
      style={styles.scroll}
      testID="move-response-variant-b"
    >
      <PrototypeHeader
        appearance="inverse"
        kicker="B · MOVE RECEIPT"
        summary="Keep a persistent audit trail beside the board so every accepted or ignored tap has an explanation."
        title="One move, one clear receipt"
      />
      <View style={[styles.receiptSplit, props.compact ? styles.receiptStack : null]}>
        <View style={styles.receiptBoardColumn}>
          <BoardStage {...props} />
          <VisibleFeedback definition={props.definition} compact />
        </View>
        <View style={styles.receiptCard}>
          <View style={styles.receiptHeadingRow}>
            <View>
              <Text style={styles.receiptEyebrow}>MOVE RECEIPT · #01</Text>
              <Text style={styles.receiptTitle}>{props.definition.headline}</Text>
            </View>
            <Text style={styles.receiptTime}>{props.definition.time}</Text>
          </View>
          <ReceiptRow label="Input disposition" value={inputDisposition(props.phase)} />
          <ReceiptRow label="Board gate" value={props.definition.input === "ready" ? "Open" : "Locked"} />
          <ReceiptRow label="Visible fallback" value={props.definition.badge} />
          <ReceiptRow label="Sound preference" value={props.soundEnabled ? "On · represented" : "Muted"} />
          <ReceiptRow label="Haptic preference" value={props.hapticsEnabled ? "On · represented" : "Off"} />
          <PreferenceRow {...props} />
          <StateScrubber onChange={props.onPhaseChange} phase={props.phase} />
        </View>
      </View>
      <NativeBoundaryNote />
    </ScrollView>
  );
}

function BoardPulseVariant(props: VariantProps): React.JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={styles.pulsePage}
      style={styles.scroll}
      testID="move-response-variant-c"
    >
      <View style={styles.pulseTopLine}>
        <Text style={styles.pulseKicker}>C · BOARD PULSE</Text>
        <Text style={styles.pulseChannelSummary}>
          {props.soundEnabled ? "SOUND ON" : "SOUND OFF"} · {props.hapticsEnabled ? "HAPTIC ON" : "HAPTIC OFF"}
        </Text>
      </View>
      <View style={styles.pulseStage}>
        <View style={styles.pulseBoardFrame}>
          <BoardStage {...props} />
          <View pointerEvents="none" style={styles.pulseOverlay}>
            <Text style={[styles.pulseOverlayBadge, toneTextStyle(props.definition.tone)]}>
              {props.definition.badge}
            </Text>
            <Text style={styles.pulseOverlayTitle}>{props.definition.headline}</Text>
            <Text style={styles.pulseOverlayDetail}>{props.definition.time} · {props.definition.input.toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.pulseExplanation}>
        The board itself carries the visible fallback. The user never has to look away to know whether input is locked or ready.
      </Text>
      <View style={styles.pulseControls}>
        <PreferenceRow {...props} />
        <StateScrubber onChange={props.onPhaseChange} phase={props.phase} />
      </View>
      <NativeBoundaryNote />
    </ScrollView>
  );
}

function PrototypeHeader({
  appearance = "default",
  kicker,
  summary,
  title
}: {
  appearance?: "default" | "inverse";
  kicker: string;
  summary: string;
  title: string;
}): React.JSX.Element {
  const inverse = appearance === "inverse";
  return (
    <View style={styles.header}>
      <Text style={[styles.kicker, inverse ? styles.kickerInverse : null]}>
        {kicker} · DESIGN PROTOTYPE · #246 + #247
      </Text>
      <Text style={[styles.title, inverse ? styles.titleInverse : null]}>{title}</Text>
      <Text style={[styles.summary, inverse ? styles.summaryInverse : null]}>{summary}</Text>
    </View>
  );
}

function BoardStage(props: VariantProps): React.JSX.Element {
  const inputReady = props.definition.input === "ready";
  const expectedMove = props.phase === "ready" ? "e2e4" : "e7e5";
  const fen = props.phase === "ready" ? START_FEN : AFTER_FIRST_MOVE_FEN;

  return (
    <View style={styles.boardStage}>
      <BoardPlaceholder
        boardSize={props.boardSize}
        fen={fen}
        gestureEnabled={inputReady}
        labExpectedMove={expectedMove}
        onMove={() => props.onPhaseChange("accepted")}
      />
    </View>
  );
}

function VisibleFeedback({
  compact = false,
  definition
}: {
  compact?: boolean;
  definition: PhaseDefinition;
}): React.JSX.Element {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.feedback, compact ? styles.feedbackCompact : null, toneSurfaceStyle(definition.tone)]}
      testID="move-response-visible-feedback"
    >
      <View style={styles.feedbackLabelRow}>
        <Text style={[styles.feedbackBadge, toneTextStyle(definition.tone)]}>{definition.badge}</Text>
        <Text style={styles.feedbackTime}>{definition.time}</Text>
      </View>
      <Text style={styles.feedbackHeadline}>{definition.headline}</Text>
      <Text style={styles.feedbackDetail}>{definition.detail}</Text>
    </View>
  );
}

function SignalCell({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.signalCell}>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={styles.signalValue}>{value}</Text>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

function PreferenceRow(props: VariantProps): React.JSX.Element {
  return (
    <View style={styles.preferenceSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Feedback preferences</Text>
        <Text style={styles.sectionCaption}>Representation only</Text>
      </View>
      <View style={styles.preferenceRow}>
        <PreferenceToggle
          enabled={props.soundEnabled}
          label="Sound"
          onChange={props.onSoundChange}
          testID="move-response-sound-toggle"
        />
        <PreferenceToggle
          enabled={props.hapticsEnabled}
          label="Haptic"
          onChange={props.onHapticsChange}
          testID="move-response-haptic-toggle"
        />
        <View style={styles.visibleAlwaysChip}>
          <Text style={styles.visibleAlwaysText}>Visible · Always on</Text>
        </View>
      </View>
    </View>
  );
}

function PreferenceToggle({
  enabled,
  label,
  onChange,
  testID
}: {
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={() => onChange(!enabled)}
      style={[styles.preferenceToggle, enabled ? styles.preferenceToggleOn : null]}
      testID={testID}
    >
      <Text style={[styles.preferenceToggleText, enabled ? styles.preferenceToggleTextOn : null]}>
        {label} · {enabled ? "On" : "Off"}
      </Text>
    </Pressable>
  );
}

function StateScrubber({
  onChange,
  phase
}: {
  onChange: (phase: ResponsePhase) => void;
  phase: ResponsePhase;
}): React.JSX.Element {
  const options: readonly { label: string; phase: ResponsePhase }[] = [
    { label: "Ready", phase: "ready" },
    { label: "Accepted · 0ms", phase: "accepted" },
    { label: "Feedback · 80ms", phase: "feedback" },
    { label: "Early tap ignored", phase: "ignored" },
    { label: "Next ready · 180ms", phase: "next-ready" }
  ];

  return (
    <View style={styles.stateSection}>
      <Text style={styles.sectionTitle}>Deterministic contract states</Text>
      <View style={styles.stateRow}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.phase}
            onPress={() => onChange(option.phase)}
            style={[styles.stateButton, phase === option.phase ? styles.stateButtonActive : null]}
            testID={`move-response-state-${option.phase}`}
          >
            <Text style={[styles.stateButtonText, phase === option.phase ? styles.stateButtonTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NativeBoundaryNote(): React.JSX.Element {
  return (
    <View style={styles.boundaryNote}>
      <Text style={styles.boundaryTitle}>STORYBOOK BOUNDARY</Text>
      <Text style={styles.boundaryCopy}>
        This design slice cannot validate real board lag, missed native taps, audio playback, or haptic delivery. Issue #246 still needs native diagnosis; #247 still needs device-level audio and haptic validation after design approval.
      </Text>
    </View>
  );
}

function feedbackChannelLabel(phase: ResponsePhase): string {
  if (phase === "feedback") {
    return "Visible + channels";
  }
  if (phase === "accepted" || phase === "ignored") {
    return "Preparing";
  }
  return "Idle";
}

function inputDisposition(phase: ResponsePhase): string {
  if (phase === "ignored") {
    return "Ignored · too early";
  }
  if (phase === "accepted" || phase === "feedback") {
    return "Accepted";
  }
  return "Waiting for input";
}

function toneSurfaceStyle(tone: PhaseDefinition["tone"]): object {
  if (tone === "good") {
    return styles.toneGoodSurface;
  }
  if (tone === "warn") {
    return styles.toneWarnSurface;
  }
  return styles.toneCalmSurface;
}

function toneTextStyle(tone: PhaseDefinition["tone"]): object {
  if (tone === "good") {
    return styles.toneGoodText;
  }
  if (tone === "warn") {
    return styles.toneWarnText;
  }
  return styles.toneCalmText;
}

function readVariant(): VariantKey {
  const candidate = readQueryParameter("variant");
  return isVariantKey(candidate) ? candidate : "A";
}

function readPhase(): ResponsePhase {
  const candidate = readQueryParameter("state");
  return isResponsePhase(candidate) ? candidate : "ready";
}

function readQueryParameter(name: string): string | null {
  if (typeof globalThis.location === "undefined") {
    return null;
  }
  return new URLSearchParams(globalThis.location.search).get(name);
}

function replaceQueryParameter(name: string, value: string): void {
  if (typeof globalThis.location === "undefined" || typeof globalThis.history === "undefined") {
    return;
  }
  const url = new URL(globalThis.location.href);
  url.searchParams.set(name, value);
  globalThis.history.replaceState({}, "", url);
}

function isVariantKey(value: string | null): value is VariantKey {
  return value === "A" || value === "B" || value === "C";
}

function isResponsePhase(value: string | null): value is ResponsePhase {
  return value === "ready"
    || value === "accepted"
    || value === "feedback"
    || value === "ignored"
    || value === "next-ready";
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#F3F5F2",
    flex: 1,
    minHeight: "100%"
  },
  scroll: {
    flex: 1
  },
  railPage: {
    alignItems: "center",
    backgroundColor: "#F4F7F2",
    gap: 18,
    minHeight: "100%",
    paddingBottom: 112,
    paddingHorizontal: 18,
    paddingTop: 28
  },
  receiptPage: {
    backgroundColor: "#101B23",
    gap: 24,
    minHeight: "100%",
    paddingBottom: 112,
    paddingHorizontal: 22,
    paddingTop: 30
  },
  pulsePage: {
    alignItems: "center",
    backgroundColor: "#E9FF5B",
    gap: 18,
    minHeight: "100%",
    paddingBottom: 112,
    paddingHorizontal: 16,
    paddingTop: 22
  },
  header: {
    alignSelf: "stretch",
    gap: 8,
    maxWidth: 980
  },
  kicker: {
    color: "#44624A",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  kickerInverse: {
    color: "#9ED0AE"
  },
  title: {
    color: "#17251C",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 34
  },
  titleInverse: {
    color: "#F7FAF8"
  },
  summary: {
    color: "#53665A",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 700
  },
  summaryInverse: {
    color: "#CBD9D1"
  },
  feedback: {
    alignSelf: "stretch",
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    maxWidth: 620,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  feedbackCompact: {
    marginTop: 12
  },
  feedbackLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  feedbackBadge: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1
  },
  feedbackTime: {
    color: "#59645D",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "700"
  },
  feedbackHeadline: {
    color: "#17251C",
    fontSize: 23,
    fontWeight: "900"
  },
  feedbackDetail: {
    color: "#46544A",
    fontSize: 13,
    lineHeight: 18
  },
  toneGoodSurface: {
    backgroundColor: "#E8F8E9",
    borderColor: "#69A874"
  },
  toneWarnSurface: {
    backgroundColor: "#FFF0D9",
    borderColor: "#D88125"
  },
  toneCalmSurface: {
    backgroundColor: "#E9F1FF",
    borderColor: "#7B9DCF"
  },
  toneGoodText: {
    color: "#24743A"
  },
  toneWarnText: {
    color: "#A14F0A"
  },
  toneCalmText: {
    color: "#315F9D"
  },
  boardStage: {
    alignItems: "center",
    alignSelf: "center"
  },
  signalRail: {
    alignSelf: "stretch",
    backgroundColor: "#17251C",
    borderRadius: 16,
    flexDirection: "row",
    maxWidth: 720,
    overflow: "hidden"
  },
  signalCell: {
    borderRightColor: "#3D5143",
    borderRightWidth: 1,
    flex: 1,
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 13
  },
  signalLabel: {
    color: "#AFC5B4",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7
  },
  signalValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800"
  },
  receiptSplit: {
    alignItems: "flex-start",
    alignSelf: "center",
    flexDirection: "row",
    gap: 24,
    maxWidth: 980,
    width: "100%"
  },
  receiptStack: {
    alignItems: "stretch",
    flexDirection: "column"
  },
  receiptBoardColumn: {
    flex: 1
  },
  receiptCard: {
    backgroundColor: "#F5F1E8",
    borderColor: "#C8BDA8",
    borderRadius: 3,
    borderWidth: 1,
    flex: 1,
    gap: 0,
    padding: 18
  },
  receiptHeadingRow: {
    alignItems: "flex-start",
    borderBottomColor: "#C8BDA8",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 15
  },
  receiptEyebrow: {
    color: "#7A674D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  receiptTitle: {
    color: "#27231E",
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 5
  },
  receiptTime: {
    color: "#675C4E",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700"
  },
  receiptRow: {
    alignItems: "center",
    borderBottomColor: "#D8CFBF",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11
  },
  receiptLabel: {
    color: "#786D5F",
    fontSize: 12
  },
  receiptValue: {
    color: "#27231E",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right"
  },
  pulseTopLine: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "space-between",
    maxWidth: 780
  },
  pulseKicker: {
    color: "#12170B",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1
  },
  pulseChannelSummary: {
    color: "#394013",
    fontSize: 9,
    fontWeight: "900"
  },
  pulseStage: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center"
  },
  pulseBoardFrame: {
    borderColor: "#12170B",
    borderWidth: 4,
    position: "relative"
  },
  pulseOverlay: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "#12170B",
    borderWidth: 2,
    bottom: 12,
    left: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
    position: "absolute",
    right: 12
  },
  pulseOverlayBadge: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1
  },
  pulseOverlayTitle: {
    color: "#12170B",
    fontSize: 24,
    fontWeight: "900"
  },
  pulseOverlayDetail: {
    color: "#4B5034",
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2
  },
  pulseExplanation: {
    color: "#303611",
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 640,
    textAlign: "center"
  },
  pulseControls: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderColor: "#12170B",
    borderRadius: 18,
    borderWidth: 2,
    gap: 14,
    maxWidth: 760,
    padding: 16
  },
  preferenceSection: {
    alignSelf: "stretch",
    gap: 9,
    marginTop: 14
  },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: "#243029",
    fontSize: 12,
    fontWeight: "900"
  },
  sectionCaption: {
    color: "#7A857E",
    fontSize: 10,
    fontWeight: "700"
  },
  preferenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  preferenceToggle: {
    backgroundColor: "#EEF0ED",
    borderColor: "#B6BDB8",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  preferenceToggleOn: {
    backgroundColor: "#153E2A",
    borderColor: "#153E2A"
  },
  preferenceToggleText: {
    color: "#405048",
    fontSize: 11,
    fontWeight: "800"
  },
  preferenceToggleTextOn: {
    color: "#FFFFFF"
  },
  visibleAlwaysChip: {
    backgroundColor: "#E6EEFF",
    borderColor: "#7998D1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  visibleAlwaysText: {
    color: "#315F9D",
    fontSize: 11,
    fontWeight: "800"
  },
  stateSection: {
    alignSelf: "stretch",
    gap: 9,
    marginTop: 14,
    maxWidth: 760
  },
  stateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  stateButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A9B4AC",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  stateButtonActive: {
    backgroundColor: "#25382B",
    borderColor: "#25382B"
  },
  stateButtonText: {
    color: "#35433A",
    fontSize: 10,
    fontWeight: "800"
  },
  stateButtonTextActive: {
    color: "#FFFFFF"
  },
  boundaryNote: {
    alignSelf: "stretch",
    backgroundColor: "#FEF3C7",
    borderColor: "#D97706",
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    maxWidth: 980,
    padding: 12
  },
  boundaryTitle: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9
  },
  boundaryCopy: {
    color: "#78350F",
    fontSize: 11,
    lineHeight: 16
  }
});
