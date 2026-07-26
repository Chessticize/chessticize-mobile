import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

export type ICloudSyncSupportBundleResult = {
  bundleUrl?: string;
  files: readonly string[];
  kind: "complete" | "partial";
  unavailableReason?: string;
};

export type ICloudSyncSupportBundlePresentation = {
  onDiscard?: (result: ICloudSyncSupportBundleResult) => Promise<void> | void;
  onPrepare: () => Promise<ICloudSyncSupportBundleResult>;
  onShare: (result: ICloudSyncSupportBundleResult) => Promise<void> | void;
};

export type ICloudSyncErrorDetailsPresentation = {
  copyText: string;
  message: string;
  occurredAtLabel: string;
  onCopy: (text: string) => Promise<void> | void;
  supportBundle?: ICloudSyncSupportBundlePresentation;
};

export function ICloudSyncSupportDiagnosticsEntry({
  presentation
}: {
  presentation: ICloudSyncSupportBundlePresentation;
}): React.JSX.Element {
  return (
    <ICloudSyncErrorDetails
      entryVariant="support"
      presentation={{
        copyText: "",
        message: "",
        occurredAtLabel: "",
        onCopy: async () => {},
        supportBundle: presentation
      }}
    />
  );
}

type CopyState = "idle" | "copying" | "copied" | "failed";
type Panel = "details" | "export-confirmation" | "preparing" | "ready";
type ShareState = "idle" | "sharing" | "shared" | "failed";

export function ICloudSyncErrorDetails({
  entryVariant = "error",
  presentation
}: {
  entryVariant?: "error" | "support";
  presentation: ICloudSyncErrorDetailsPresentation;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [panel, setPanel] = useState<Panel>(
    entryVariant === "support" ? "export-confirmation" : "details"
  );
  const [bundleResult, setBundleResult] = useState<ICloudSyncSupportBundleResult | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");

  function close(): void {
    if (bundleResult) {
      void presentation.supportBundle?.onDiscard?.(bundleResult);
    }
    setVisible(false);
    setCopyState("idle");
    setPanel(entryVariant === "support" ? "export-confirmation" : "details");
    setBundleResult(null);
    setPrepareError(null);
    setShareState("idle");
  }

  async function copyDetails(): Promise<void> {
    setCopyState("copying");
    try {
      await presentation.onCopy(presentation.copyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function prepareSupportBundle(): Promise<void> {
    if (!presentation.supportBundle) {
      return;
    }
    setPrepareError(null);
    setPanel("preparing");
    try {
      const result = await presentation.supportBundle.onPrepare();
      setBundleResult(result);
      setPanel("ready");
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : "The support bundle could not be prepared.");
      setPanel("export-confirmation");
    }
  }

  async function shareSupportBundle(): Promise<void> {
    if (!presentation.supportBundle || !bundleResult) {
      return;
    }
    setShareState("sharing");
    try {
      await presentation.supportBundle.onShare(bundleResult);
      setShareState("shared");
    } catch {
      setShareState("failed");
    }
  }

  const modalTitle = panel === "details"
    ? "iCloud Sync Error"
    : panel === "export-confirmation"
      ? "Export Support Diagnostics?"
      : panel === "preparing"
        ? "Preparing Support Bundle"
        : bundleResult?.kind === "partial"
          ? "Partial Support Bundle Ready"
          : "Support Bundle Ready";
  const modalBadge = panel === "details"
    ? "LOCAL DIAGNOSTIC"
    : bundleResult?.kind === "partial" && panel === "ready"
      ? "PARTIAL BUNDLE"
      : panel === "ready"
        ? "BUNDLE READY"
        : "SUPPORT BUNDLE";

  return (
    <>
      <Pressable
        accessibilityLabel={entryVariant === "support"
          ? "Export iCloud sync diagnostics and progress for support"
          : `View iCloud sync error details. Last failed ${presentation.occurredAtLabel}.`}
        accessibilityRole="button"
        onPress={() => {
          setCopyState("idle");
          setPanel(entryVariant === "support" ? "export-confirmation" : "details");
          setBundleResult(null);
          setPrepareError(null);
          setShareState("idle");
          setVisible(true);
        }}
        style={entryVariant === "support" ? styles.supportEntry : styles.entry}
        testID={entryVariant === "support"
          ? "settings-sync-support-bundle-entry"
          : "settings-sync-error-details"}
      >
        <View style={entryVariant === "support" ? styles.supportEntryIndicator : styles.entryIndicator}>
          <Text style={entryVariant === "support"
            ? styles.supportEntryIndicatorText
            : styles.entryIndicatorText}
          >
            {entryVariant === "support" ? "↥" : "!"}
          </Text>
        </View>
        <View style={styles.entryCopy}>
          <Text style={entryVariant === "support" ? styles.supportEntryTitle : styles.entryTitle}>
            {entryVariant === "support" ? "Export Support Diagnostics" : "View Error Details"}
          </Text>
          <Text style={entryVariant === "support" ? styles.supportEntryDetail : styles.entryDetail}>
            {entryVariant === "support"
              ? "Share a local database snapshot, iCloud snapshot, and diagnostic details."
              : `Last failed ${presentation.occurredAtLabel}. Copy technical information for support.`}
          </Text>
        </View>
        <Text style={entryVariant === "support" ? styles.supportEntryChevron : styles.entryChevron}>
          ›
        </Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={visible}
      >
        <View style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            style={styles.modal}
            testID={entryVariant === "support"
              ? "settings-sync-support-bundle-modal"
              : "settings-sync-error-details-modal"}
          >
            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator
            >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{modalBadge}</Text>
                  </View>
                  <Text style={styles.title}>{modalTitle}</Text>
                  <Text style={styles.subtitle}>
                    {panel === "details"
                      ? "These details can help support understand why the last sync failed."
                      : panel === "export-confirmation"
                        ? "Create a file you can send to support so the app and sync state can be diagnosed."
                        : panel === "preparing"
                          ? "Creating a consistent local database snapshot and fetching the latest iCloud progress snapshot."
                          : "Review what was included before opening the iOS Share Sheet."}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={entryVariant === "support"
                    ? "Close support diagnostics"
                    : "Close iCloud sync error details"}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={close}
                  style={styles.closeIconButton}
                  testID="settings-sync-error-details-close-icon"
                >
                  <Text style={styles.closeIcon}>×</Text>
                </Pressable>
              </View>

              {panel === "details" ? (
                <>
                  <View style={styles.messageCard}>
                    <Text style={styles.cardLabel}>WHAT HAPPENED</Text>
                    <Text selectable style={styles.message} testID="settings-sync-error-message">
                      {presentation.message}
                    </Text>
                  </View>

                  <View style={styles.privacyCard}>
                    <Text style={styles.privacyTitle}>Your progress stays private</Text>
                    <Text style={styles.privacyCopy}>
                      Nothing is uploaded. These error details do not include your iCloud account,
                      ratings, history, puzzles, or saved progress. You choose where to paste them
                      after copying.
                    </Text>
                  </View>

                  <View style={styles.technicalSection}>
                    <Text style={styles.technicalTitle}>Technical details</Text>
                    <Text style={styles.technicalHelp}>
                      You can select this text manually if copying is unavailable.
                    </Text>
                    <View style={styles.technicalCard}>
                      <Text
                        selectable
                        style={styles.technicalText}
                        testID="settings-sync-error-diagnostic-text"
                      >
                        {presentation.copyText}
                      </Text>
                    </View>
                  </View>

                  {copyState === "copied" ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.copySuccess}
                      testID="settings-sync-error-copy-success"
                    >
                      Copied. Paste these details into your support message.
                    </Text>
                  ) : null}
                  {copyState === "failed" ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.copyFailure}
                      testID="settings-sync-error-copy-failure"
                    >
                      Couldn&apos;t copy automatically. Select the technical details above to copy
                      them manually.
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel="Close iCloud sync error details"
                      accessibilityRole="button"
                      onPress={close}
                      style={styles.secondaryButton}
                      testID="settings-sync-error-details-close"
                    >
                      <Text style={styles.secondaryButtonText}>Close</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Copy iCloud sync error details"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: copyState === "copying" }}
                      disabled={copyState === "copying"}
                      onPress={() => {
                        void copyDetails();
                      }}
                      style={[
                        styles.primaryButton,
                        copyState === "copying" ? styles.primaryButtonDisabled : null
                      ]}
                      testID="settings-sync-error-copy"
                    >
                      <Text style={styles.primaryButtonText}>
                        {copyState === "copying" ? "Copying…" : "Copy Error Details"}
                      </Text>
                    </Pressable>
                  </View>

                  {presentation.supportBundle ? (
                    <View style={styles.exportCard}>
                      <View style={styles.exportCardCopy}>
                        <Text style={styles.exportTitle}>Need help reproducing the problem?</Text>
                        <Text style={styles.exportCopy}>
                          Export the local database, iCloud progress snapshot, and this diagnostic
                          in one support bundle.
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel="Export iCloud sync support bundle"
                        accessibilityRole="button"
                        onPress={() => {
                          setPrepareError(null);
                          setPanel("export-confirmation");
                        }}
                        style={styles.exportButton}
                        testID="settings-sync-support-bundle-open"
                      >
                        <Text style={styles.exportButtonText}>Export Support Bundle</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : null}

              {panel === "export-confirmation" ? (
                <>
                  <View style={styles.sensitiveCard}>
                    <Text style={styles.sensitiveTitle}>This bundle contains progress data</Text>
                    <Text style={styles.sensitiveCopy}>
                      It may include ratings, attempts and history, review queue entries, settings,
                      run configuration, and timestamps. Review where you send it.
                    </Text>
                  </View>

                  <View style={styles.fileSection}>
                    <Text style={styles.technicalTitle}>Files prepared</Text>
                    <BundleFile
                      description="A transactionally consistent snapshot of progress stored on this device."
                      name="local-progress.sqlite"
                    />
                    <BundleFile
                      description="The latest progress snapshot downloaded from CloudKit, when available."
                      name="icloud-progress-snapshot.json"
                    />
                    <BundleFile
                      description={entryVariant === "support"
                        ? "App, database, and sync environment details, plus the latest failure captured in this session."
                        : "The copyable sync failure details shown above, plus app and sync environment details."}
                      name="diagnostic.txt"
                    />
                    <BundleFile
                      description="App and iOS versions, database health, timestamps, checksums, and file availability."
                      name="manifest.json"
                    />
                  </View>

                  <View style={styles.excludedCard}>
                    <Text style={styles.excludedTitle}>Not included</Text>
                    <Text style={styles.excludedCopy}>
                      Your Apple ID, iCloud credentials, hardware identifiers, and the bundled
                      puzzle pack are not included. The progress data does contain the app-generated
                      sync ID needed to reproduce merge behavior.
                    </Text>
                  </View>

                  <Text style={styles.noUploadCopy}>
                    Nothing is uploaded automatically. After preparation, the iOS Share Sheet lets
                    you choose where to send the bundle.
                  </Text>

                  {prepareError ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.copyFailure}
                      testID="settings-sync-support-bundle-prepare-error"
                    >
                      {prepareError} Try again, or copy the error details instead.
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel={entryVariant === "support"
                        ? "Cancel support diagnostics export"
                        : "Back to iCloud sync error details"}
                      accessibilityRole="button"
                      onPress={() => {
                        if (entryVariant === "support") {
                          close();
                          return;
                        }
                        setPanel("details");
                      }}
                      style={styles.secondaryButton}
                      testID="settings-sync-support-bundle-back"
                    >
                      <Text style={styles.secondaryButtonText}>
                        {entryVariant === "support" ? "Cancel" : "Back"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Prepare iCloud sync support bundle"
                      accessibilityRole="button"
                      onPress={() => {
                        void prepareSupportBundle();
                      }}
                      style={styles.primaryButton}
                      testID="settings-sync-support-bundle-prepare"
                    >
                      <Text style={styles.primaryButtonText}>Prepare Support Bundle</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {panel === "preparing" ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.preparing}
                  testID="settings-sync-support-bundle-preparing"
                >
                  <ActivityIndicator color="#2563EB" size="large" />
                  <Text style={styles.preparingTitle}>Preparing files…</Text>
                  <Text style={styles.preparingCopy}>
                    Keep Chessticize open. Your data stays on this device until you choose a share
                    destination.
                  </Text>
                </View>
              ) : null}

              {panel === "ready" && bundleResult ? (
                <>
                  {bundleResult.kind === "partial" ? (
                    <View
                      style={styles.partialCard}
                      testID="settings-sync-support-bundle-partial"
                    >
                      <Text style={styles.partialTitle}>iCloud snapshot couldn&apos;t be included</Text>
                      <Text style={styles.partialCopy}>
                        {bundleResult.unavailableReason
                          ?? "CloudKit did not return a progress snapshot."}
                      </Text>
                      <Text style={styles.partialHelp}>
                        The local database and diagnostic can still help, but this bundle is not a
                        complete reproduction.
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={styles.completeCard}
                      testID="settings-sync-support-bundle-complete"
                    >
                      <Text style={styles.completeTitle}>Complete reproduction bundle</Text>
                      <Text style={styles.completeCopy}>
                        Both the local database and the downloaded iCloud progress snapshot are
                        included.
                      </Text>
                    </View>
                  )}

                  <View style={styles.fileSection}>
                    <Text style={styles.technicalTitle}>Included files</Text>
                    {bundleResult.files.map((file) => (
                      <View key={file} style={styles.readyFileRow}>
                        <Text style={styles.readyFileCheck}>✓</Text>
                        <Text style={styles.readyFileName}>{file}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.privacyCard}>
                    <Text style={styles.privacyTitle}>You control the handoff</Text>
                    <Text style={styles.privacyCopy}>
                      The next action asks iOS to open its Share Sheet. Chessticize does not choose
                      a recipient or upload the bundle.
                    </Text>
                  </View>

                  {shareState === "shared" ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.copySuccess}
                      testID="settings-sync-support-bundle-shared"
                    >
                      Share Sheet requested. Choose where to send the bundle.
                    </Text>
                  ) : null}
                  {shareState === "failed" ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.copyFailure}
                      testID="settings-sync-support-bundle-share-error"
                    >
                      The Share Sheet couldn&apos;t be opened. Your prepared bundle remains
                      available while this window is open.
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel={entryVariant === "support"
                        ? "Close support diagnostics"
                        : "Back to iCloud sync error details"}
                      accessibilityRole="button"
                      onPress={() => {
                        if (entryVariant === "support") {
                          close();
                          return;
                        }
                        setPanel("details");
                      }}
                      style={styles.secondaryButton}
                      testID="settings-sync-support-bundle-details"
                    >
                      <Text style={styles.secondaryButtonText}>
                        {entryVariant === "support" ? "Close" : "Back to Details"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Share iCloud sync support bundle"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: shareState === "sharing" }}
                      disabled={shareState === "sharing"}
                      onPress={() => {
                        void shareSupportBundle();
                      }}
                      style={[
                        styles.primaryButton,
                        shareState === "sharing" ? styles.primaryButtonDisabled : null
                      ]}
                      testID="settings-sync-support-bundle-share"
                    >
                      <Text style={styles.primaryButtonText}>
                        {shareState === "sharing" ? "Opening…" : "Share Support Bundle"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function BundleFile({
  description,
  name
}: {
  description: string;
  name: string;
}): React.JSX.Element {
  return (
    <View style={styles.fileRow}>
      <View style={styles.fileIcon}>
        <Text style={styles.fileIconText}>✓</Text>
      </View>
      <View style={styles.fileCopy}>
        <Text style={styles.fileName}>{name}</Text>
        <Text style={styles.fileDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderBottomColor: "#FED7AA",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  entryIndicator: {
    alignItems: "center",
    backgroundColor: "#FFEDD5",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  entryIndicatorText: {
    color: "#C2410C",
    fontSize: 17,
    fontWeight: "900"
  },
  entryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  entryTitle: {
    color: "#9A3412",
    fontSize: 14,
    fontWeight: "900"
  },
  entryDetail: {
    color: "#7C2D12",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  entryChevron: {
    color: "#C2410C",
    fontSize: 26,
    fontWeight: "500"
  },
  supportEntry: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#CBD5E1",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  supportEntryIndicator: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  supportEntryIndicatorText: {
    color: "#1D4ED8",
    fontSize: 17,
    fontWeight: "900"
  },
  supportEntryTitle: {
    color: "#1E3A8A",
    fontSize: 14,
    fontWeight: "900"
  },
  supportEntryDetail: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  supportEntryChevron: {
    color: "#2563EB",
    fontSize: 26,
    fontWeight: "500"
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  modal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    maxHeight: "92%",
    maxWidth: 520,
    overflow: "hidden",
    width: "100%"
  },
  modalContent: {
    gap: 16,
    padding: 20
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  headerCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  badgeText: {
    color: "#9A3412",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  title: {
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "900"
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  closeIconButton: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  closeIcon: {
    color: "#475569",
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 27
  },
  messageCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderRadius: 11,
    borderWidth: 1,
    gap: 6,
    padding: 13
  },
  cardLabel: {
    color: "#9A3412",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  message: {
    color: "#7C2D12",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  privacyCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 11,
    gap: 4,
    padding: 13
  },
  privacyTitle: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "900"
  },
  privacyCopy: {
    color: "#1E40AF",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  exportCard: {
    alignItems: "stretch",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 11,
    borderWidth: 1,
    gap: 12,
    padding: 13
  },
  exportCardCopy: {
    gap: 4
  },
  exportTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900"
  },
  exportCopy: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  exportButton: {
    alignItems: "center",
    borderColor: "#2563EB",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  exportButtonText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  sensitiveCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderRadius: 11,
    borderWidth: 1,
    gap: 5,
    padding: 13
  },
  sensitiveTitle: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "900"
  },
  sensitiveCopy: {
    color: "#991B1B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  fileSection: {
    gap: 10
  },
  fileRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  fileIcon: {
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    height: 23,
    justifyContent: "center",
    marginTop: 1,
    width: 23
  },
  fileIconText: {
    color: "#15803D",
    fontSize: 12,
    fontWeight: "900"
  },
  fileCopy: {
    flex: 1,
    gap: 2
  },
  fileName: {
    color: "#0F172A",
    fontFamily: Platform.select({
      android: "monospace",
      default: "monospace",
      ios: "Menlo"
    }),
    fontSize: 11,
    fontWeight: "800"
  },
  fileDescription: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 15
  },
  excludedCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 11,
    gap: 4,
    padding: 13
  },
  excludedTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  excludedCopy: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  noUploadCopy: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 17
  },
  preparing: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 30
  },
  preparingTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900"
  },
  preparingCopy: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    maxWidth: 340,
    textAlign: "center"
  },
  partialCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderRadius: 11,
    borderWidth: 1,
    gap: 5,
    padding: 13
  },
  partialTitle: {
    color: "#9A3412",
    fontSize: 14,
    fontWeight: "900"
  },
  partialCopy: {
    color: "#C2410C",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 17
  },
  partialHelp: {
    color: "#7C2D12",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  completeCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderRadius: 11,
    borderWidth: 1,
    gap: 5,
    padding: 13
  },
  completeTitle: {
    color: "#065F46",
    fontSize: 14,
    fontWeight: "900"
  },
  completeCopy: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17
  },
  readyFileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  readyFileCheck: {
    color: "#15803D",
    fontSize: 13,
    fontWeight: "900"
  },
  readyFileName: {
    color: "#334155",
    fontFamily: Platform.select({
      android: "monospace",
      default: "monospace",
      ios: "Menlo"
    }),
    fontSize: 11,
    fontWeight: "800"
  },
  technicalSection: {
    gap: 7
  },
  technicalTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  technicalHelp: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  technicalCard: {
    backgroundColor: "#0F172A",
    borderRadius: 11,
    padding: 13
  },
  technicalText: {
    color: "#E2E8F0",
    fontFamily: Platform.select({
      android: "monospace",
      default: "monospace",
      ios: "Menlo"
    }),
    fontSize: 11,
    lineHeight: 17
  },
  copySuccess: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  copyFailure: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    justifyContent: "flex-end"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 16
  },
  secondaryButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 9,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 45,
    minWidth: 190,
    paddingHorizontal: 18
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  }
});
