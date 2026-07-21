import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

// PROTOTYPE ONLY: three Settings-context feedback entry designs, switchable with ?variant=.
// This Interaction Lab slice intentionally contains no Linking.openURL call or product wiring.

export type FeedbackEntryVariant = "compact" | "support-card" | "preflight";
type HandoffStage = "idle" | "confirm" | "handoff";
type FeedbackKind = "general" | "bug" | "feature";

type PrototypeState = {
  variant: FeedbackEntryVariant;
  stage: HandoffStage;
  kind: FeedbackKind;
};

type VariantDefinition = {
  key: FeedbackEntryVariant;
  shortLabel: string;
  title: string;
};

const VARIANTS: readonly VariantDefinition[] = [
  { key: "compact", shortLabel: "A", title: "About row" },
  { key: "support-card", shortLabel: "B", title: "Support card" },
  { key: "preflight", shortLabel: "C", title: "Preflight chooser" }
];

const VALID_VARIANTS = new Set<FeedbackEntryVariant>(VARIANTS.map((variant) => variant.key));
const VALID_STAGES = new Set<HandoffStage>(["idle", "confirm", "handoff"]);
const VALID_KINDS = new Set<FeedbackKind>(["general", "bug", "feature"]);

export function FeedbackEntryPrototype(): React.JSX.Element {
  const [prototypeState, setPrototypeState] = useState<PrototypeState>(readPrototypeState);

  useEffect(() => {
    const onPopState = (): void => setPrototypeState(readPrototypeState());
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setPrototypeState((current) => {
        const next = stateForVariant(cycleVariant(current.variant, event.key === "ArrowRight" ? 1 : -1));
        writePrototypeState(next);
        return next;
      });
    };
    globalThis.document.addEventListener("keydown", onKeyDown);
    return () => globalThis.document.removeEventListener("keydown", onKeyDown);
  }, []);

  const beginHandoff = (kind: FeedbackKind): void => {
    const next = { ...prototypeState, stage: "confirm" as const, kind };
    writePrototypeState(next);
    setPrototypeState(next);
  };

  const confirmHandoff = (): void => {
    const next = { ...prototypeState, stage: "handoff" as const };
    writePrototypeState(next);
    setPrototypeState(next);
  };

  const closeHandoff = (): void => {
    const next = { ...prototypeState, stage: "idle" as const, kind: "general" as const };
    writePrototypeState(next);
    setPrototypeState(next);
  };

  const switchVariant = (variant: FeedbackEntryVariant): void => {
    const next = stateForVariant(variant);
    writePrototypeState(next);
    setPrototypeState(next);
  };

  return (
    <div style={{ display: "flex", inset: 0, minHeight: 0, overflow: "hidden", position: "fixed" }}>
      <View style={styles.appShell} testID="feedback-entry-prototype">
        <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>SETTINGS</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.previewBadge}>
          <Text style={styles.previewBadgeText}>DESIGN PREVIEW</Text>
        </View>
        </View>

        <ScrollView
          key={prototypeState.variant}
          style={styles.scroller}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {prototypeState.variant === "compact" ? (
          <CompactAboutRowVariant onBeginHandoff={beginHandoff} />
        ) : null}
        {prototypeState.variant === "support-card" ? (
          <SupportCardVariant onBeginHandoff={beginHandoff} />
        ) : null}
        {prototypeState.variant === "preflight" ? (
          <PreflightChooserVariant onBeginHandoff={beginHandoff} />
        ) : null}
        <View style={styles.bottomClearance} />
        </ScrollView>

        <SettingsTabBar />
        <PrototypeSwitcher
          current={prototypeState.variant}
          onSelect={switchVariant}
        />
        {prototypeState.stage !== "idle" ? (
          <BrowserHandoffPreview
            kind={prototypeState.kind}
            stage={prototypeState.stage}
            onCancel={closeHandoff}
            onContinue={confirmHandoff}
          />
        ) : null}
      </View>
    </div>
  );
}

function CompactAboutRowVariant({
  onBeginHandoff
}: {
  onBeginHandoff: (kind: FeedbackKind) => void;
}): React.JSX.Element {
  return (
    <View style={styles.variantStack} testID="feedback-variant-compact">
      <ContextSection title="Notifications">
        <StaticSettingsRow label="Review Reminders" detail="Smart schedule" value="Smart" />
      </ContextSection>
      <ContextSection title="Profile">
        <StaticSettingsRow label="Edit ELO" detail="Standard and Arrow Duel difficulty" value="ELO 900" />
      </ContextSection>
      <ContextSection title="About">
        <StaticSettingsRow label="App Version" value="0.1.0 (104)" />
        <StaticSettingsRow label="License" detail="App source license" value="GPL-3.0" />
        <StaticSettingsRow label="Source" detail="Public Chessticize mobile repository" value="GitHub" />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Report an issue, opens GitHub Issues in your browser, no app data is attached"
          testID="feedback-open-github"
          style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressedRow : null]}
          onPress={() => onBeginHandoff("general")}
        >
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>Report an issue</Text>
            <Text style={styles.rowDetail}>Questions, bugs, and feature requests</Text>
            <Text style={styles.externalHint}>Opens GitHub Issues in your browser · no app data attached</Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.rowValue}>GitHub</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
        <StaticSettingsRow label="Support" detail="Private questions and account support" value="Email" />
      </ContextSection>
      <Text style={styles.variantRationale}>
        A · Lowest visual weight. GitHub sits beside the existing source and support links.
      </Text>
    </View>
  );
}

function SupportCardVariant({
  onBeginHandoff
}: {
  onBeginHandoff: (kind: FeedbackKind) => void;
}): React.JSX.Element {
  return (
    <View style={styles.variantStack} testID="feedback-variant-support-card">
      <ContextSection title="Notifications">
        <StaticSettingsRow label="Review Reminders" detail="Smart schedule" value="Smart" />
      </ContextSection>
      <ContextSection title="Profile">
        <StaticSettingsRow label="Edit ELO" detail="Standard and Arrow Duel difficulty" value="ELO 900" />
      </ContextSection>

      <View style={styles.supportSection}>
        <Text style={styles.sectionLabel}>Help & Feedback</Text>
        <View style={styles.supportCard}>
          <View style={styles.supportCardHeader}>
            <View style={styles.supportIcon}>
              <Text style={styles.supportIconText}>?</Text>
            </View>
            <View style={styles.supportCardCopy}>
              <Text style={styles.supportCardTitle}>Help improve Chessticize</Text>
              <Text style={styles.supportCardDetail}>
                Report a bug, request a feature, or see whether someone has already raised it.
              </Text>
            </View>
          </View>
          <View style={styles.privacyStrip}>
            <Text style={styles.privacyStripTitle}>Your data stays in the app</Text>
            <Text style={styles.privacyStripCopy}>
              GitHub opens in your browser. Ratings, history, and puzzle data are not attached.
            </Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open GitHub Issues in browser"
            testID="feedback-open-github"
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.primaryButtonPressed : null]}
            onPress={() => onBeginHandoff("general")}
          >
            <Text style={styles.primaryButtonText}>Open GitHub Issues</Text>
            <Text style={styles.primaryButtonArrow}>↗</Text>
          </Pressable>
          <Text style={styles.notSubmissionCopy}>You will review and submit your issue on GitHub.</Text>
        </View>
      </View>

      <ContextSection title="About">
        <StaticSettingsRow label="App Version" value="0.1.0 (104)" />
        <StaticSettingsRow label="Source & licenses" detail="Repository, engine, and puzzle data" value="View" />
        <StaticSettingsRow label="Email support" detail="Private questions and account support" value="Email" />
      </ContextSection>
      <Text style={styles.variantRationale}>
        B · A visible support destination with one clear external action and a compact privacy promise.
      </Text>
    </View>
  );
}

function PreflightChooserVariant({
  onBeginHandoff
}: {
  onBeginHandoff: (kind: FeedbackKind) => void;
}): React.JSX.Element {
  return (
    <View style={styles.variantStack} testID="feedback-variant-preflight">
      <ContextSection title="Profile">
        <StaticSettingsRow label="Edit ELO" detail="Standard and Arrow Duel difficulty" value="ELO 900" />
      </ContextSection>

      <View style={styles.preflightSection}>
        <View style={styles.preflightHeading}>
          <Text style={styles.preflightEyebrow}>HELP & FEEDBACK</Text>
          <Text style={styles.preflightTitle}>What would you like to share?</Text>
          <Text style={styles.preflightLede}>
            Choose a destination, then finish your report on GitHub in your browser.
          </Text>
        </View>

        <View style={styles.chooserStack}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Report a bug on GitHub"
            testID="feedback-open-github"
            style={({ pressed }) => [styles.chooserCard, pressed ? styles.chooserCardPressed : null]}
            onPress={() => onBeginHandoff("bug")}
          >
            <View style={[styles.chooserGlyph, styles.bugGlyph]}>
              <Text style={styles.bugGlyphText}>!</Text>
            </View>
            <View style={styles.chooserCopy}>
              <Text style={styles.chooserTitle}>Something is not working</Text>
              <Text style={styles.chooserDetail}>Report a bug with steps to reproduce it</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Request a feature on GitHub"
            testID="feedback-open-github-feature"
            style={({ pressed }) => [styles.chooserCard, pressed ? styles.chooserCardPressed : null]}
            onPress={() => onBeginHandoff("feature")}
          >
            <View style={[styles.chooserGlyph, styles.ideaGlyph]}>
              <Text style={styles.ideaGlyphText}>+</Text>
            </View>
            <View style={styles.chooserCopy}>
              <Text style={styles.chooserTitle}>I have an idea</Text>
              <Text style={styles.chooserDetail}>Suggest a feature or improvement</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.beforeCard}>
          <Text style={styles.beforeTitle}>Before GitHub opens</Text>
          <PreflightPoint text="Search existing issues to avoid duplicates" />
          <PreflightPoint text="Remove names, ratings, dates, or other personal details" />
          <PreflightPoint text="Nothing is submitted until you submit it on GitHub" />
        </View>
        <Pressable accessibilityRole="button" style={styles.emailLink}>
          <Text style={styles.emailLinkText}>Need a private reply? Email support instead</Text>
        </Pressable>
      </View>

      <ContextSection title="About">
        <StaticSettingsRow label="App Version" value="0.1.0 (104)" />
        <StaticSettingsRow label="Source & licenses" detail="Repository, engine, and puzzle data" value="View" />
      </ContextSection>
      <Text style={styles.variantRationale}>
        C · More guidance and better issue routing, at the cost of a larger Settings footprint.
      </Text>
    </View>
  );
}

function ContextSection({ children, title }: { children: React.ReactNode; title: string }): React.JSX.Element {
  return (
    <View style={styles.contextSection}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

function StaticSettingsRow({
  detail,
  label,
  value
}: {
  detail?: string;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function PreflightPoint({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.preflightPoint}>
      <View style={styles.preflightDot} />
      <Text style={styles.preflightPointText}>{text}</Text>
    </View>
  );
}

function BrowserHandoffPreview({
  kind,
  onCancel,
  onContinue,
  stage
}: {
  kind: FeedbackKind;
  onCancel: () => void;
  onContinue: () => void;
  stage: Exclude<HandoffStage, "idle">;
}): React.JSX.Element {
  const targetLabel = kind === "bug" ? "bug report" : kind === "feature" ? "feature request" : "new issue";
  return (
    <View style={styles.handoffBackdrop} testID={stage === "confirm" ? "feedback-handoff-confirmation" : "feedback-handoff-complete"}>
      <View style={styles.handoffCard}>
        {stage === "confirm" ? (
          <>
            <View style={styles.externalBadge}>
              <Text style={styles.externalBadgeText}>EXTERNAL BROWSER</Text>
            </View>
            <Text style={styles.handoffTitle}>Continue to GitHub?</Text>
            <Text style={styles.handoffCopy}>
              A {targetLabel} will open on github.com in your default browser. Chessticize does not attach your account, rating, history, or puzzle data.
            </Text>
            <View style={styles.handoffPrivacyCard}>
              <Text style={styles.handoffPrivacyTitle}>You stay in control</Text>
              <Text style={styles.handoffPrivacyCopy}>
                Review what you share and submit it on GitHub. This is not an in-app submission.
              </Text>
            </View>
            <View style={styles.handoffActions}>
              <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Not now</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                style={styles.continueButton}
                testID="feedback-confirm-handoff"
                onPress={onContinue}
              >
                <Text style={styles.continueButtonText}>Continue to GitHub</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.labBoundaryBadge}>
              <Text style={styles.labBoundaryBadgeText}>LAB HANDOFF PREVIEW</Text>
            </View>
            <Text style={styles.handoffTitle}>Browser handoff</Text>
            <Text style={styles.handoffCopy}>
              The production app would now open the GitHub {targetLabel} page. Storybook stopped at the external-browser boundary, so no browser opened and nothing was submitted.
            </Text>
            <View style={styles.destinationCard}>
              <Text style={styles.destinationLabel}>DESTINATION</Text>
              <Text style={styles.destinationValue}>github.com/Chessticize/chessticize-mobile/issues/new</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={styles.continueButton}
              testID="feedback-return-settings"
              onPress={onCancel}
            >
              <Text style={styles.continueButtonText}>Return to Settings preview</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function PrototypeSwitcher({
  current,
  onSelect
}: {
  current: FeedbackEntryVariant;
  onSelect: (variant: FeedbackEntryVariant) => void;
}): React.JSX.Element {
  const currentIndex = VARIANTS.findIndex((variant) => variant.key === current);
  const selectOffset = (offset: number): void => {
    const next = VARIANTS[(currentIndex + offset + VARIANTS.length) % VARIANTS.length]!;
    onSelect(next.key);
  };
  const definition = VARIANTS[currentIndex]!;
  return (
    <View style={styles.switcher} testID="feedback-variant-switcher">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous feedback design"
        style={styles.switcherArrow}
        onPress={() => selectOffset(-1)}
      >
        <Text style={styles.switcherArrowText}>←</Text>
      </Pressable>
      <View style={styles.switcherLabel}>
        <Text style={styles.switcherKey}>{definition.shortLabel}</Text>
        <Text style={styles.switcherTitle}>{definition.title}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next feedback design"
        style={styles.switcherArrow}
        onPress={() => selectOffset(1)}
      >
        <Text style={styles.switcherArrowText}>→</Text>
      </Pressable>
    </View>
  );
}

function SettingsTabBar(): React.JSX.Element {
  return (
    <View style={styles.tabBar} accessibilityLabel="App navigation context">
      {[
        ["◉", "Practice"],
        ["◇", "Review"],
        ["◷", "History"],
        ["☷", "Settings"]
      ].map(([glyph, label]) => (
        <View key={label} style={styles.tabItem}>
          <Text style={[styles.tabGlyph, label === "Settings" ? styles.tabActive : null]}>{glyph}</Text>
          <Text style={[styles.tabLabel, label === "Settings" ? styles.tabActive : null]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function cycleVariant(current: FeedbackEntryVariant, offset: number): FeedbackEntryVariant {
  const currentIndex = VARIANTS.findIndex((variant) => variant.key === current);
  return VARIANTS[(currentIndex + offset + VARIANTS.length) % VARIANTS.length]!.key;
}

function stateForVariant(variant: FeedbackEntryVariant): PrototypeState {
  return { variant, stage: "idle", kind: "general" };
}

function readPrototypeState(): PrototypeState {
  const params = new URLSearchParams(globalThis.location.search);
  const variantParam = params.get("variant") as FeedbackEntryVariant | null;
  const stageParam = params.get("state") as HandoffStage | null;
  const kindParam = params.get("kind") as FeedbackKind | null;
  return {
    variant: variantParam && VALID_VARIANTS.has(variantParam) ? variantParam : "compact",
    stage: stageParam && VALID_STAGES.has(stageParam) ? stageParam : "idle",
    kind: kindParam && VALID_KINDS.has(kindParam) ? kindParam : "general"
  };
}

function writePrototypeState(state: PrototypeState): void {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("variant", state.variant);
  if (state.stage === "idle") {
    url.searchParams.delete("state");
    url.searchParams.delete("kind");
  } else {
    url.searchParams.set("state", state.stage);
    url.searchParams.set("kind", state.kind);
  }
  globalThis.history.replaceState(null, "", url);
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: "#F8FAFC",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  header: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 14
  },
  headerEyebrow: { color: "#64748B", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  headerTitle: { color: "#111827", fontSize: 22, fontWeight: "800", lineHeight: 28 },
  previewBadge: { backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  previewBadgeText: { color: "#92400E", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  scroller: { flex: 1 },
  scrollContent: { alignSelf: "center", padding: 16, paddingTop: 4, width: "100%", maxWidth: 680 },
  variantStack: { gap: 14 },
  contextSection: { gap: 7 },
  sectionLabel: { color: "#111827", fontSize: 15, fontWeight: "800" },
  settingsCard: { backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", borderRadius: 9, borderWidth: 1, overflow: "hidden" },
  settingsRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  pressedRow: { backgroundColor: "#EFF6FF" },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: "#111827", fontSize: 14, fontWeight: "800" },
  rowDetail: { color: "#64748B", fontSize: 12, fontWeight: "600", lineHeight: 16 },
  externalHint: { color: "#2563EB", fontSize: 11, fontWeight: "800", lineHeight: 15 },
  rowMeta: { alignItems: "center", flexDirection: "row", gap: 5, maxWidth: "34%" },
  rowValue: { color: "#64748B", fontSize: 12, fontWeight: "800", textAlign: "right" },
  chevron: { color: "#334155", fontSize: 24, fontWeight: "500", lineHeight: 24 },
  variantRationale: { color: "#64748B", fontSize: 11, fontWeight: "700", lineHeight: 16, paddingHorizontal: 2 },
  supportSection: { gap: 7 },
  supportCard: { backgroundColor: "#FFFFFF", borderColor: "#BFDBFE", borderRadius: 14, borderWidth: 1, gap: 14, padding: 16 },
  supportCardHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  supportIcon: { alignItems: "center", backgroundColor: "#DBEAFE", borderRadius: 999, height: 42, justifyContent: "center", width: 42 },
  supportIconText: { color: "#1D4ED8", fontSize: 22, fontWeight: "900" },
  supportCardCopy: { flex: 1, gap: 3 },
  supportCardTitle: { color: "#0F172A", fontSize: 18, fontWeight: "900" },
  supportCardDetail: { color: "#475569", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  privacyStrip: { backgroundColor: "#F8FAFC", borderRadius: 9, gap: 2, padding: 11 },
  privacyStripTitle: { color: "#334155", fontSize: 12, fontWeight: "900" },
  privacyStripCopy: { color: "#64748B", fontSize: 11, fontWeight: "600", lineHeight: 16 },
  primaryButton: { alignItems: "center", backgroundColor: "#2563EB", borderRadius: 9, flexDirection: "row", justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
  primaryButtonPressed: { backgroundColor: "#1D4ED8" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  primaryButtonArrow: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginLeft: 8 },
  notSubmissionCopy: { color: "#64748B", fontSize: 10, fontWeight: "700", textAlign: "center" },
  preflightSection: { backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", borderRadius: 14, borderWidth: 1, gap: 16, padding: 16 },
  preflightHeading: { gap: 5 },
  preflightEyebrow: { color: "#2563EB", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  preflightTitle: { color: "#0F172A", fontSize: 21, fontWeight: "900", lineHeight: 27 },
  preflightLede: { color: "#64748B", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  chooserStack: { gap: 9 },
  chooserCard: { alignItems: "center", backgroundColor: "#F8FAFC", borderColor: "#CBD5E1", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 68, padding: 11 },
  chooserCardPressed: { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
  chooserGlyph: { alignItems: "center", borderRadius: 9, height: 38, justifyContent: "center", width: 38 },
  bugGlyph: { backgroundColor: "#FEE2E2" },
  bugGlyphText: { color: "#B91C1C", fontSize: 20, fontWeight: "900" },
  ideaGlyph: { backgroundColor: "#DBEAFE" },
  ideaGlyphText: { color: "#1D4ED8", fontSize: 23, fontWeight: "800" },
  chooserCopy: { flex: 1, gap: 2 },
  chooserTitle: { color: "#111827", fontSize: 14, fontWeight: "900" },
  chooserDetail: { color: "#64748B", fontSize: 11, fontWeight: "600", lineHeight: 15 },
  beforeCard: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  beforeTitle: { color: "#78350F", fontSize: 12, fontWeight: "900" },
  preflightPoint: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  preflightDot: { backgroundColor: "#F59E0B", borderRadius: 999, height: 5, marginTop: 6, width: 5 },
  preflightPointText: { color: "#92400E", flex: 1, fontSize: 11, fontWeight: "600", lineHeight: 16 },
  emailLink: { alignItems: "center", minHeight: 32, justifyContent: "center" },
  emailLinkText: { color: "#2563EB", fontSize: 12, fontWeight: "800" },
  handoffBackdrop: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.58)", bottom: 0, justifyContent: "center", left: 0, padding: 20, position: "absolute", right: 0, top: 0, zIndex: 200 },
  handoffCard: { backgroundColor: "#FFFFFF", borderRadius: 16, gap: 14, maxWidth: 430, padding: 20, width: "100%" },
  externalBadge: { alignSelf: "flex-start", backgroundColor: "#DBEAFE", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  externalBadgeText: { color: "#1D4ED8", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  labBoundaryBadge: { alignSelf: "flex-start", backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  labBoundaryBadgeText: { color: "#92400E", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  handoffTitle: { color: "#0F172A", fontSize: 22, fontWeight: "900" },
  handoffCopy: { color: "#475569", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  handoffPrivacyCard: { backgroundColor: "#F8FAFC", borderRadius: 9, gap: 3, padding: 12 },
  handoffPrivacyTitle: { color: "#334155", fontSize: 12, fontWeight: "900" },
  handoffPrivacyCopy: { color: "#64748B", fontSize: 11, fontWeight: "600", lineHeight: 16 },
  handoffActions: { flexDirection: "row", gap: 9, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: "#CBD5E1", borderRadius: 9, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelButtonText: { color: "#475569", fontSize: 13, fontWeight: "800" },
  continueButton: { alignItems: "center", backgroundColor: "#2563EB", borderRadius: 9, justifyContent: "center", minHeight: 44, paddingHorizontal: 16 },
  continueButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", textAlign: "center" },
  destinationCard: { backgroundColor: "#F1F5F9", borderRadius: 9, gap: 4, padding: 12 },
  destinationLabel: { color: "#64748B", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  destinationValue: { color: "#1D4ED8", fontSize: 11, fontWeight: "800", lineHeight: 16 },
  switcher: { alignItems: "center", alignSelf: "center", backgroundColor: "#0F172A", borderRadius: 999, bottom: 66, flexDirection: "row", minHeight: 44, padding: 4, position: "absolute", zIndex: 100 },
  switcherArrow: { alignItems: "center", height: 36, justifyContent: "center", width: 40 },
  switcherArrowText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  switcherLabel: { alignItems: "center", borderLeftColor: "#334155", borderLeftWidth: 1, borderRightColor: "#334155", borderRightWidth: 1, flexDirection: "row", gap: 7, minWidth: 144, paddingHorizontal: 12 },
  switcherKey: { backgroundColor: "#FFFFFF", borderRadius: 999, color: "#0F172A", fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3 },
  switcherTitle: { color: "#F8FAFC", fontSize: 11, fontWeight: "800" },
  tabBar: { alignItems: "center", backgroundColor: "#FFFFFF", borderTopColor: "#E2E8F0", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-around", minHeight: 58, paddingBottom: 4, paddingTop: 6 },
  tabItem: { alignItems: "center", flex: 1, gap: 2 },
  tabGlyph: { color: "#64748B", fontSize: 16, fontWeight: "700" },
  tabLabel: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  tabActive: { color: "#2563EB" },
  bottomClearance: { height: 66 }
});
