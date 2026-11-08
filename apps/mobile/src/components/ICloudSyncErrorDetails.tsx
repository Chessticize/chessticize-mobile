import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
import { makeStyles, useTheme } from "../theme/index.ts";
import {
  AppText,
  Badge,
  Button,
  Icon,
  IconTile,
  useListRowStyle,
  type IconName,
  type IconTone
} from "./ui/index.tsx";

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
  platform?: "android" | "ios";
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
  const styles = useStyles();
  const theme = useTheme();
  const rowStyle = useListRowStyle();
  const [visible, setVisible] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [panel, setPanel] = useState<Panel>(
    entryVariant === "support" ? "export-confirmation" : "details"
  );
  const [bundleResult, setBundleResult] = useState<ICloudSyncSupportBundleResult | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const supportPlatform = presentation.supportBundle?.platform ?? "ios";
  const isAndroidSupportBundle = supportPlatform === "android";
  const bundleResultRef = useRef<ICloudSyncSupportBundleResult | null>(null);
  const preparationGenerationRef = useRef(0);
  const supportBundleRef = useRef(presentation.supportBundle);
  const visibleRef = useRef(false);
  supportBundleRef.current = presentation.supportBundle;

  useEffect(() => () => {
    visibleRef.current = false;
    preparationGenerationRef.current += 1;
    const pendingResult = bundleResultRef.current;
    bundleResultRef.current = null;
    if (pendingResult) {
      discardSupportBundleResult(pendingResult);
    }
  }, []);

  function discardSupportBundleResult(result: ICloudSyncSupportBundleResult): void {
    const discard = supportBundleRef.current?.onDiscard;
    if (!discard) {
      return;
    }
    void Promise.resolve(discard(result)).catch(() => {
      // Native expiry remains the final cleanup boundary if explicit discard fails.
    });
  }

  function close(): void {
    visibleRef.current = false;
    preparationGenerationRef.current += 1;
    const pendingResult = bundleResultRef.current;
    bundleResultRef.current = null;
    if (pendingResult) {
      discardSupportBundleResult(pendingResult);
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
    const preparationGeneration = preparationGenerationRef.current + 1;
    preparationGenerationRef.current = preparationGeneration;
    const replacedResult = bundleResultRef.current;
    bundleResultRef.current = null;
    setBundleResult(null);
    if (replacedResult) {
      discardSupportBundleResult(replacedResult);
    }
    setPrepareError(null);
    setPanel("preparing");
    try {
      const result = await presentation.supportBundle.onPrepare();
      if (
        !visibleRef.current
        || preparationGenerationRef.current !== preparationGeneration
      ) {
        discardSupportBundleResult(result);
        return;
      }
      bundleResultRef.current = result;
      setBundleResult(result);
      setPanel("ready");
    } catch (error) {
      if (
        !visibleRef.current
        || preparationGenerationRef.current !== preparationGeneration
      ) {
        return;
      }
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
      bundleResultRef.current = null;
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

  const statusBadgeTone = panel === "details" || (panel === "ready" && bundleResult?.kind === "partial")
    ? "warning"
    : panel === "ready"
      ? "positive"
      : "accent";
  const shareBusy = shareState === "sharing" || shareState === "shared";

  return (
    <>
      <Pressable
        accessibilityLabel={entryVariant === "support"
          ? "Export app diagnostics and progress for support"
          : `View iCloud sync error details. Last failed ${presentation.occurredAtLabel}.`}
        accessibilityRole="button"
        onPress={() => {
          visibleRef.current = true;
          preparationGenerationRef.current += 1;
          bundleResultRef.current = null;
          setCopyState("idle");
          setPanel(entryVariant === "support" ? "export-confirmation" : "details");
          setBundleResult(null);
          setPrepareError(null);
          setShareState("idle");
          setVisible(true);
        }}
        style={({ pressed }) => [rowStyle, pressed ? styles.entryPressed : null]}
        testID={entryVariant === "support"
          ? "settings-sync-support-bundle-entry"
          : "settings-sync-error-details"}
      >
        <IconTile
          alignFirstLine
          name={entryVariant === "support" ? "share" : "warning"}
          tone={entryVariant === "support" ? "accent" : "warning"}
        />
        <View style={styles.copy}>
          <AppText variant="body">
            {entryVariant === "support" ? "Export Support Diagnostics" : "View Error Details"}
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {entryVariant === "support"
              ? isAndroidSupportBundle
                ? "Share a local SQLite snapshot and diagnostic details."
                : "Share a local database snapshot, iCloud progress records, and diagnostic details."
              : `Last failed ${presentation.occurredAtLabel}. Copy technical information for support.`}
          </AppText>
        </View>
        <Icon color={theme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={visible}
      >
        <SafeAreaModalBackdrop style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            style={[
              styles.modal,
              entryVariant === "support" ? styles.supportModal : null
            ]}
            testID={entryVariant === "support"
              ? "settings-sync-support-bundle-modal"
              : "settings-sync-error-details-modal"}
          >
            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator
              style={styles.modalScroll}
              testID={entryVariant === "support"
                ? "settings-sync-support-bundle-scroll"
                : "settings-sync-error-details-scroll"}
            >
              <View style={styles.header}>
                <View style={styles.copy}>
                  <Badge label={modalBadge} tone={statusBadgeTone} />
                  <AppText variant="title">{modalTitle}</AppText>
                  <AppText tone="secondary" variant="subheadline">
                    {panel === "details"
                      ? "These details can help support understand why the last sync failed."
                      : panel === "export-confirmation"
                        ? "Create a file you can send to support so the app and sync state can be diagnosed."
                        : panel === "preparing"
                          ? isAndroidSupportBundle
                            ? "Creating a consistent local SQLite snapshot and checking its integrity."
                            : "Creating a consistent local database snapshot and a full read-only iCloud progress capture."
                          : isAndroidSupportBundle
                            ? "Review what was included before opening Android share options."
                            : "Review what was included before opening the iOS Share Sheet."}
                  </AppText>
                </View>
                <Pressable
                  accessibilityLabel={entryVariant === "support"
                    ? "Close support diagnostics"
                    : "Close iCloud sync error details"}
                  accessibilityRole="button"
                  onPress={close}
                  style={({ pressed }) => [styles.closeIconButton, pressed ? styles.entryPressed : null]}
                  testID="settings-sync-error-details-close-icon"
                >
                  <Icon color={theme.colors.text.secondary} name="close" size={17} weight="semibold" />
                </Pressable>
              </View>

              {panel === "details" ? (
                <>
                  <View style={styles.block}>
                    <AppText style={styles.label} tone="secondary" variant="caption">WHAT HAPPENED</AppText>
                    <Text selectable style={styles.message} testID="settings-sync-error-message">
                      {presentation.message}
                    </Text>
                  </View>

                  <Note title="Your progress stays private">
                    Nothing is uploaded. These error details do not include your iCloud account,
                    ratings, history, puzzles, or saved progress. You choose where to paste them
                    after copying.
                  </Note>

                  <View style={styles.block}>
                    <AppText variant="headline">Technical details</AppText>
                    <AppText tone="secondary" variant="footnote">
                      You can select this text manually if copying is unavailable.
                    </AppText>
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
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-error-copy-success"
                      tone="positive"
                      variant="footnote"
                    >
                      Copied. Paste these details into your support message.
                    </AppText>
                  ) : null}
                  {copyState === "failed" ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-error-copy-failure"
                      tone="negative"
                      variant="footnote"
                    >
                      Couldn&apos;t copy automatically. Select the technical details above to copy
                      them manually.
                    </AppText>
                  ) : null}

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel="Close iCloud sync error details"
                      label="Close"
                      stretch
                      testID="settings-sync-error-details-close"
                      variant="secondary"
                      onPress={close}
                    />
                    <Button
                      accessibilityLabel="Copy iCloud sync error details"
                      disabled={copyState === "copying"}
                      label={copyState === "copying" ? "Copying…" : "Copy Error Details"}
                      stretch
                      testID="settings-sync-error-copy"
                      onPress={() => {
                        void copyDetails();
                      }}
                    />
                  </View>

                  {presentation.supportBundle ? (
                    <View style={[styles.block, styles.divided]}>
                      <AppText variant="headline">Need help reproducing the problem?</AppText>
                      <AppText tone="secondary" variant="footnote">
                        {isAndroidSupportBundle
                          ? "Export the local SQLite database and this diagnostic in one support bundle."
                          : "Export the local database, iCloud progress records, and this diagnostic in one support bundle."}
                      </AppText>
                      <Button
                        accessibilityLabel="Export support diagnostics bundle"
                        icon="share"
                        label="Export Support Bundle"
                        size="compact"
                        testID="settings-sync-support-bundle-open"
                        variant="secondary"
                        onPress={() => {
                          setPrepareError(null);
                          setPanel("export-confirmation");
                        }}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}

              {panel === "export-confirmation" ? (
                <>
                  <Callout icon="warning" title="This bundle contains progress data" tone="warning">
                    It may include ratings, attempts and history, review queue entries, settings,
                    run configuration, and timestamps. Review where you send it.
                  </Callout>

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel={entryVariant === "support"
                        ? "Cancel support diagnostics export"
                        : "Back to iCloud sync error details"}
                      label={entryVariant === "support" ? "Cancel" : "Back"}
                      stretch
                      testID="settings-sync-support-bundle-back"
                      variant="secondary"
                      onPress={() => {
                        if (entryVariant === "support") {
                          close();
                          return;
                        }
                        setPanel("details");
                      }}
                    />
                    <Button
                      accessibilityLabel="Prepare support diagnostics bundle"
                      label="Prepare Support Bundle"
                      stretch
                      testID="settings-sync-support-bundle-prepare"
                      onPress={() => {
                        void prepareSupportBundle();
                      }}
                    />
                  </View>

                  <View style={styles.block}>
                    <AppText variant="headline">Files prepared</AppText>
                    <BundleFile
                      description="A transactionally consistent snapshot of progress stored on this device."
                      name="local-progress.sqlite"
                    />
                    {isAndroidSupportBundle ? null : (
                      <BundleFile
                        description="A full read-only capture of V2 records and deletions, stored as one line-delimited file."
                        name="icloud-progress-v2.ndjson"
                      />
                    )}
                    {isAndroidSupportBundle ? null : (
                      <BundleFile
                        description="The legacy V1 snapshot, included only during bridging when it exists."
                        name="icloud-progress-v1.json (optional)"
                      />
                    )}
                    <BundleFile
                      description={entryVariant === "support"
                        ? isAndroidSupportBundle
                          ? "App, Android, database, and progress-protection details."
                          : "App, database, and sync environment details, plus the latest failure captured in this session."
                        : "The copyable sync failure details shown above, plus app and sync environment details."}
                      name="diagnostic.txt"
                    />
                    <BundleFile
                      description={`App and ${isAndroidSupportBundle ? "Android" : "iOS"} versions, database health, timestamps, checksums, and file availability.`}
                      name="manifest.json"
                    />
                  </View>

                  <Note title="Not included">
                    {isAndroidSupportBundle
                      ? "Your Google account, credentials, hardware identifiers, and the bundled puzzle pack are not included."
                      : "Your Apple ID, iCloud credentials, hardware identifiers, and the bundled puzzle pack are not included. The progress data does contain the app-generated sync ID needed to reproduce merge behavior."}
                  </Note>

                  <AppText tone="secondary" variant="footnote">
                    {isAndroidSupportBundle
                      ? "Nothing is uploaded automatically. After preparation, Android lets you choose where to send the bundle."
                      : "Nothing is uploaded automatically. After preparation, the iOS Share Sheet lets you choose where to send the bundle."}
                  </AppText>

                  {prepareError ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-support-bundle-prepare-error"
                      tone="negative"
                      variant="footnote"
                    >
                      {prepareError} Try again, or copy the error details instead.
                    </AppText>
                  ) : null}
                </>
              ) : null}

              {panel === "preparing" ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.preparing}
                  testID="settings-sync-support-bundle-preparing"
                >
                  <ActivityIndicator color={theme.colors.accent.s600} size="large" />
                  <AppText variant="headline">Preparing files…</AppText>
                  <AppText style={styles.centered} tone="secondary" variant="footnote">
                    Keep Chessticize open. Your data stays on this device until you choose a share
                    destination.
                  </AppText>
                </View>
              ) : null}

              {panel === "ready" && bundleResult ? (
                <>
                  {bundleResult.kind === "partial" ? (
                    <Callout
                      icon="warning"
                      testID="settings-sync-support-bundle-partial"
                      title={isAndroidSupportBundle
                        ? "Local SQLite snapshot couldn't be included"
                        : "iCloud progress capture couldn't be completed"}
                      tone="warning"
                    >
                      <AppText tone="secondary" variant="footnote">
                        {bundleResult.unavailableReason
                          ?? (isAndroidSupportBundle
                            ? "The local progress snapshot was unavailable."
                            : "CloudKit did not return a complete progress capture.")}
                      </AppText>
                      <AppText tone="secondary" variant="footnote">
                        {isAndroidSupportBundle
                          ? "The diagnostic and manifest can still help, but this bundle does not include the local progress database needed for reproduction."
                          : "The local database and diagnostic can still help, but this bundle is not a complete reproduction."}
                      </AppText>
                    </Callout>
                  ) : (
                    <Callout
                      icon="check"
                      testID="settings-sync-support-bundle-complete"
                      title={isAndroidSupportBundle
                        ? "Android diagnostics bundle ready"
                        : "Complete reproduction bundle"}
                      tone="positive"
                    >
                      {isAndroidSupportBundle
                        ? "The consistent local SQLite snapshot and diagnostic details are included."
                        : "The local database and a complete read-only V2 CloudKit capture are included."}
                    </Callout>
                  )}

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel={entryVariant === "support"
                        ? "Close support diagnostics"
                        : "Back to iCloud sync error details"}
                      label={entryVariant === "support" ? "Close" : "Back to Details"}
                      stretch
                      testID="settings-sync-support-bundle-details"
                      variant="secondary"
                      onPress={() => {
                        if (entryVariant === "support") {
                          close();
                          return;
                        }
                        setPanel("details");
                      }}
                    />
                    <Button
                      accessibilityLabel="Share support diagnostics bundle"
                      disabled={shareBusy}
                      icon="share"
                      label={shareState === "sharing"
                        ? "Opening…"
                        : shareState === "shared"
                          ? isAndroidSupportBundle
                            ? "Share Options Opened"
                            : "Bundle Removed"
                          : "Share Support Bundle"}
                      stretch
                      testID="settings-sync-support-bundle-share"
                      onPress={() => {
                        void shareSupportBundle();
                      }}
                    />
                  </View>

                  <View style={styles.block}>
                    <AppText variant="headline">Included files</AppText>
                    {bundleResult.files.map((file) => (
                      <View key={file} style={styles.readyFileRow}>
                        <Icon color={theme.colors.positive.s600} name="check" size={15} weight="semibold" />
                        <Text style={styles.fileName}>{file}</Text>
                      </View>
                    ))}
                  </View>

                  <Note title="You control the handoff">
                    {isAndroidSupportBundle
                      ? "The next action asks Android to open its share options. Chessticize does not choose a recipient or upload the bundle."
                      : "The next action asks iOS to open its Share Sheet. Chessticize does not choose a recipient or upload the bundle."}
                  </Note>

                  {shareState === "shared" ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-support-bundle-shared"
                      tone="positive"
                      variant="footnote"
                    >
                      {isAndroidSupportBundle
                        ? "Android share options opened. The temporary bundle expires automatically."
                        : "Share Sheet closed. The temporary bundle was removed."}
                    </AppText>
                  ) : null}
                  {shareState === "failed" ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-support-bundle-share-error"
                      tone="negative"
                      variant="footnote"
                    >
                      {isAndroidSupportBundle
                        ? "Android share options couldn't be opened. Your prepared bundle remains available while this window is open."
                        : "The Share Sheet couldn't be opened. Your prepared bundle remains available while this window is open."}
                    </AppText>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaModalBackdrop>
      </Modal>
    </>
  );
}

// A short titled footnote, used instead of a nested card for supporting copy.
function Note({ children, title }: { children: React.ReactNode; title: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.note}>
      <AppText style={styles.noteTitle} variant="footnote">{title}</AppText>
      <AppText tone="secondary" variant="footnote">{children}</AppText>
    </View>
  );
}

// A status line with a tinted icon tile: a caution, a partial result or a completed bundle.
function Callout({
  children,
  icon,
  testID,
  title,
  tone
}: {
  children: React.ReactNode;
  icon: IconName;
  testID?: string;
  title: string;
  tone: IconTone;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.callout} testID={testID}>
      <IconTile name={icon} tone={tone} />
      <View style={styles.copy}>
        <AppText variant="headline">{title}</AppText>
        {typeof children === "string"
          ? <AppText tone="secondary" variant="footnote">{children}</AppText>
          : children}
      </View>
    </View>
  );
}

function BundleFile({
  description,
  name
}: {
  description: string;
  name: string;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.fileRow}>
      <Icon color={theme.colors.positive.s600} name="check" size={15} weight="semibold" />
      <View style={styles.copy}>
        <Text style={styles.fileName}>{name}</Text>
        <AppText tone="secondary" variant="footnote">{description}</AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  entryPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  copy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.scrim,
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.screen
  },
  modal: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.shape.sheet,
    maxHeight: "100%",
    maxWidth: 560,
    overflow: "hidden",
    width: "100%"
  },
  supportModal: {},
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  modalContent: {
    gap: 20,
    padding: 24
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  closeIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  block: {
    gap: theme.spacing.group
  },
  divided: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 20
  },
  label: {
    fontWeight: theme.typography.headline.fontWeight,
    letterSpacing: 0.4
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.text.primary
  },
  note: {
    gap: 2
  },
  noteTitle: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  callout: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  technicalCard: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.control,
    padding: 12
  },
  technicalText: {
    ...theme.typography.footnote,
    color: theme.colors.text.primary,
    fontFamily: theme.fontFamily.mono
  },
  actions: {
    gap: theme.spacing.group
  },
  fileRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingTop: 2
  },
  fileName: {
    ...theme.typography.footnote,
    color: theme.colors.text.primary,
    fontFamily: theme.fontFamily.mono,
    fontWeight: theme.typography.headline.fontWeight
  },
  readyFileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  preparing: {
    alignItems: "center",
    gap: theme.spacing.row,
    paddingVertical: 24
  },
  centered: {
    textAlign: "center"
  }
}));
