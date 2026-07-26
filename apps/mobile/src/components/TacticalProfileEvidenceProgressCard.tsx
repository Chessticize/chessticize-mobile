import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  TacticalProfileEvidenceCheck,
  TacticalProfileEvidenceProgress
} from "./tacticalProfilePresentation.ts";

export function TacticalProfileEvidenceProgressCard({
  progress
}: {
  progress: TacticalProfileEvidenceProgress;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`${progress.title}. ${progress.body}`}
      style={[styles.card, cardToneStyle(progress.tone)]}
      testID="tactical-profile-evidence-progress"
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Evidence snapshot</Text>
          <Text style={styles.title}>{progress.title}</Text>
        </View>
        <View style={[styles.pill, pillToneStyle(progress.tone)]}>
          <Text style={[styles.pillText, pillTextToneStyle(progress.tone)]}>
            {toneLabel(progress.tone)}
          </Text>
        </View>
      </View>
      <Text style={styles.body}>{progress.body}</Text>
      <View style={styles.checkList}>
        {progress.checks.map((check) => (
          <EvidenceCheckRow key={check.id} check={check} />
        ))}
      </View>
      <Text style={styles.footnote} testID="tactical-profile-evidence-footnote">
        {progress.footnote}
      </Text>
    </View>
  );
}

function EvidenceCheckRow({
  check
}: {
  check: TacticalProfileEvidenceCheck;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`${check.label}. ${check.value}. ${check.statusLabel}. ${check.detail}`}
      style={styles.checkRow}
      testID={`tactical-profile-evidence-check-${check.id}`}
    >
      <View style={[styles.checkIcon, checkIconStyle(check.status)]}>
        <Text style={[styles.checkIconText, checkIconTextStyle(check.status)]}>
          {check.status === "ready" ? "✓" : check.status === "building" ? "↑" : "—"}
        </Text>
      </View>
      <View style={styles.checkCopy}>
        <View style={styles.checkTitleRow}>
          <Text style={styles.checkLabel}>{check.label}</Text>
          <Text style={[styles.checkStatus, checkStatusStyle(check.status)]}>
            {check.statusLabel}
          </Text>
        </View>
        <Text style={styles.checkValue}>{check.value}</Text>
        <Text style={styles.checkDetail}>{check.detail}</Text>
      </View>
    </View>
  );
}

function toneLabel(tone: TacticalProfileEvidenceProgress["tone"]): string {
  if (tone === "ready") return "Actionable";
  if (tone === "balanced") return "Balanced";
  return "Still learning";
}

function cardToneStyle(tone: TacticalProfileEvidenceProgress["tone"]) {
  if (tone === "ready") return styles.cardReady;
  if (tone === "balanced") return styles.cardBalanced;
  return styles.cardCollecting;
}

function pillToneStyle(tone: TacticalProfileEvidenceProgress["tone"]) {
  if (tone === "ready") return styles.pillReady;
  if (tone === "balanced") return styles.pillBalanced;
  return styles.pillCollecting;
}

function pillTextToneStyle(tone: TacticalProfileEvidenceProgress["tone"]) {
  if (tone === "ready") return styles.pillTextReady;
  if (tone === "balanced") return styles.pillTextBalanced;
  return styles.pillTextCollecting;
}

function checkIconStyle(status: TacticalProfileEvidenceCheck["status"]) {
  if (status === "ready") return styles.checkIconReady;
  if (status === "building") return styles.checkIconBuilding;
  return styles.checkIconWatching;
}

function checkIconTextStyle(status: TacticalProfileEvidenceCheck["status"]) {
  if (status === "ready") return styles.checkIconTextReady;
  if (status === "building") return styles.checkIconTextBuilding;
  return styles.checkIconTextWatching;
}

function checkStatusStyle(status: TacticalProfileEvidenceCheck["status"]) {
  if (status === "ready") return styles.checkStatusReady;
  if (status === "building") return styles.checkStatusBuilding;
  return styles.checkStatusWatching;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  cardCollecting: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1"
  },
  cardBalanced: {
    backgroundColor: "#F8FAFC",
    borderColor: "#A5B4FC"
  },
  cardReady: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC"
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    minWidth: 190
  },
  eyebrow: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: "uppercase"
  },
  title: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  pillCollecting: {
    backgroundColor: "#E2E8F0"
  },
  pillBalanced: {
    backgroundColor: "#E0E7FF"
  },
  pillReady: {
    backgroundColor: "#DCFCE7"
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800"
  },
  pillTextCollecting: {
    color: "#475569"
  },
  pillTextBalanced: {
    color: "#4338CA"
  },
  pillTextReady: {
    color: "#15803D"
  },
  body: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  checkList: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden"
  },
  checkRow: {
    alignItems: "flex-start",
    borderBottomColor: "rgba(148, 163, 184, 0.25)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  checkIcon: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    marginTop: 1,
    width: 30
  },
  checkIconReady: {
    backgroundColor: "#DCFCE7"
  },
  checkIconBuilding: {
    backgroundColor: "#DBEAFE"
  },
  checkIconWatching: {
    backgroundColor: "#E2E8F0"
  },
  checkIconText: {
    fontSize: 16,
    fontWeight: "900"
  },
  checkIconTextReady: {
    color: "#15803D"
  },
  checkIconTextBuilding: {
    color: "#1D4ED8"
  },
  checkIconTextWatching: {
    color: "#64748B"
  },
  checkCopy: {
    flex: 1,
    gap: 2
  },
  checkTitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  checkLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  checkStatus: {
    fontSize: 11,
    fontWeight: "800"
  },
  checkStatusReady: {
    color: "#15803D"
  },
  checkStatusBuilding: {
    color: "#1D4ED8"
  },
  checkStatusWatching: {
    color: "#64748B"
  },
  checkValue: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21
  },
  checkDetail: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17
  },
  footnote: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18
  }
});
