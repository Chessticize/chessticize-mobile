import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
import { AppModal } from "./AppModal.tsx";
import { makeStyles, useTheme } from "../theme/index.ts";
import { useTranslation } from "../i18n/index.ts";
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
  const { t } = useTranslation();
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
      setPrepareError(error instanceof Error ? error.message : t("settings.diagnostics.prepareFallbackError"));
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
    ? t("settings.diagnostics.modalTitleDetails")
    : panel === "export-confirmation"
      ? t("settings.diagnostics.modalTitleExport")
      : panel === "preparing"
        ? t("settings.diagnostics.modalTitlePreparing")
        : bundleResult?.kind === "partial"
          ? t("settings.diagnostics.modalTitlePartial")
          : t("settings.diagnostics.modalTitleReady");
  const modalBadge = panel === "details"
    ? t("settings.diagnostics.badgeLocal")
    : bundleResult?.kind === "partial" && panel === "ready"
      ? t("settings.diagnostics.badgePartial")
      : panel === "ready"
        ? t("settings.diagnostics.badgeReady")
        : t("settings.diagnostics.badgeSupport");

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
          ? t("settings.diagnostics.entrySupportA11y")
          : t("settings.diagnostics.entryErrorA11y", { occurredAt: presentation.occurredAtLabel })}
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
          name={entryVariant === "support" ? "share" : "warning"}
          tone={entryVariant === "support" ? "accent" : "warning"}
        />
        <View style={styles.copy}>
          <AppText variant="body">
            {entryVariant === "support"
              ? t("settings.diagnostics.entrySupportTitle")
              : t("settings.diagnostics.entryErrorTitle")}
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {entryVariant === "support"
              ? isAndroidSupportBundle
                ? t("settings.diagnostics.entrySupportDetailAndroid")
                : t("settings.diagnostics.entrySupportDetailIos")
              : t("settings.diagnostics.entryErrorDetail", { occurredAt: presentation.occurredAtLabel })}
          </AppText>
        </View>
        <Icon color={theme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
      </Pressable>

      <AppModal
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
                      ? t("settings.diagnostics.subtitleDetails")
                      : panel === "export-confirmation"
                        ? t("settings.diagnostics.subtitleExport")
                        : panel === "preparing"
                          ? isAndroidSupportBundle
                            ? t("settings.diagnostics.subtitlePreparingAndroid")
                            : t("settings.diagnostics.subtitlePreparingIos")
                          : isAndroidSupportBundle
                            ? t("settings.diagnostics.subtitleReadyAndroid")
                            : t("settings.diagnostics.subtitleReadyIos")}
                  </AppText>
                </View>
                <Pressable
                  accessibilityLabel={entryVariant === "support"
                    ? t("settings.diagnostics.closeSupportA11y")
                    : t("settings.diagnostics.closeErrorA11y")}
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
                    <AppText style={styles.label} tone="secondary" variant="caption">
                      {t("settings.diagnostics.whatHappened")}
                    </AppText>
                    <Text selectable style={styles.message} testID="settings-sync-error-message">
                      {presentation.message}
                    </Text>
                  </View>

                  <Note title={t("settings.diagnostics.privacyTitle")}>
                    {t("settings.diagnostics.privacyBody")}
                  </Note>

                  <View style={styles.block}>
                    <AppText variant="headline">{t("settings.diagnostics.technicalDetails")}</AppText>
                    <AppText tone="secondary" variant="footnote">
                      {t("settings.diagnostics.technicalHint")}
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
                      {t("settings.diagnostics.copiedMessage")}
                    </AppText>
                  ) : null}
                  {copyState === "failed" ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-error-copy-failure"
                      tone="negative"
                      variant="footnote"
                    >
                      {t("settings.diagnostics.copyFailedMessage")}
                    </AppText>
                  ) : null}

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel={t("settings.diagnostics.closeErrorA11y")}
                      label={t("common.close")}
                      stretch
                      testID="settings-sync-error-details-close"
                      variant="secondary"
                      onPress={close}
                    />
                    <Button
                      accessibilityLabel={t("settings.diagnostics.copyA11y")}
                      disabled={copyState === "copying"}
                      label={copyState === "copying"
                        ? t("settings.diagnostics.copying")
                        : t("settings.diagnostics.copyButton")}
                      stretch
                      testID="settings-sync-error-copy"
                      onPress={() => {
                        void copyDetails();
                      }}
                    />
                  </View>

                  {presentation.supportBundle ? (
                    <View style={[styles.block, styles.divided]}>
                      <AppText variant="headline">{t("settings.diagnostics.reproduceTitle")}</AppText>
                      <AppText tone="secondary" variant="footnote">
                        {isAndroidSupportBundle
                          ? t("settings.diagnostics.reproduceDetailAndroid")
                          : t("settings.diagnostics.reproduceDetailIos")}
                      </AppText>
                      <Button
                        accessibilityLabel={t("settings.diagnostics.exportBundleA11y")}
                        icon="share"
                        label={t("settings.diagnostics.exportBundleButton")}
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
                  <Callout icon="warning" title={t("settings.diagnostics.containsProgressTitle")} tone="warning">
                    {t("settings.diagnostics.containsProgressBody")}
                  </Callout>

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel={entryVariant === "support"
                        ? t("settings.diagnostics.cancelExportA11y")
                        : t("settings.diagnostics.backToErrorA11y")}
                      label={entryVariant === "support" ? t("common.cancel") : t("common.back")}
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
                      accessibilityLabel={t("settings.diagnostics.prepareA11y")}
                      label={t("settings.diagnostics.prepareButton")}
                      stretch
                      testID="settings-sync-support-bundle-prepare"
                      onPress={() => {
                        void prepareSupportBundle();
                      }}
                    />
                  </View>

                  <View style={styles.block}>
                    <AppText variant="headline">{t("settings.diagnostics.filesPrepared")}</AppText>
                    <BundleFile
                      description={t("settings.diagnostics.fileLocalSqlite")}
                      name="local-progress.sqlite"
                    />
                    {isAndroidSupportBundle ? null : (
                      <BundleFile
                        description={t("settings.diagnostics.fileIcloudV2")}
                        name="icloud-progress-v2.ndjson"
                      />
                    )}
                    {isAndroidSupportBundle ? null : (
                      <BundleFile
                        description={t("settings.diagnostics.fileIcloudV1")}
                        name={t("settings.diagnostics.fileIcloudV1Name")}
                      />
                    )}
                    <BundleFile
                      description={entryVariant === "support"
                        ? isAndroidSupportBundle
                          ? t("settings.diagnostics.fileDiagnosticSupportAndroid")
                          : t("settings.diagnostics.fileDiagnosticSupportIos")
                        : t("settings.diagnostics.fileDiagnosticError")}
                      name="diagnostic.txt"
                    />
                    <BundleFile
                      description={t("settings.diagnostics.fileManifest", {
                        platform: isAndroidSupportBundle ? "Android" : "iOS"
                      })}
                      name="manifest.json"
                    />
                  </View>

                  <Note title={t("settings.diagnostics.notIncludedTitle")}>
                    {isAndroidSupportBundle
                      ? t("settings.diagnostics.notIncludedAndroid")
                      : t("settings.diagnostics.notIncludedIos")}
                  </Note>

                  <AppText tone="secondary" variant="footnote">
                    {isAndroidSupportBundle
                      ? t("settings.diagnostics.noAutoUploadAndroid")
                      : t("settings.diagnostics.noAutoUploadIos")}
                  </AppText>

                  {prepareError ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-support-bundle-prepare-error"
                      tone="negative"
                      variant="footnote"
                    >
                      {t("settings.diagnostics.prepareErrorHint", { error: prepareError })}
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
                  <AppText variant="headline">{t("settings.diagnostics.preparingFiles")}</AppText>
                  <AppText style={styles.centered} tone="secondary" variant="footnote">
                    {t("settings.diagnostics.preparingBody")}
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
                        ? t("settings.diagnostics.partialTitleAndroid")
                        : t("settings.diagnostics.partialTitleIos")}
                      tone="warning"
                    >
                      <AppText tone="secondary" variant="footnote">
                        {bundleResult.unavailableReason
                          ?? (isAndroidSupportBundle
                            ? t("settings.diagnostics.partialReasonAndroid")
                            : t("settings.diagnostics.partialReasonIos"))}
                      </AppText>
                      <AppText tone="secondary" variant="footnote">
                        {isAndroidSupportBundle
                          ? t("settings.diagnostics.partialDetailAndroid")
                          : t("settings.diagnostics.partialDetailIos")}
                      </AppText>
                    </Callout>
                  ) : (
                    <Callout
                      icon="check"
                      testID="settings-sync-support-bundle-complete"
                      title={isAndroidSupportBundle
                        ? t("settings.diagnostics.completeTitleAndroid")
                        : t("settings.diagnostics.completeTitleIos")}
                      tone="positive"
                    >
                      {isAndroidSupportBundle
                        ? t("settings.diagnostics.completeDetailAndroid")
                        : t("settings.diagnostics.completeDetailIos")}
                    </Callout>
                  )}

                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel={entryVariant === "support"
                        ? t("settings.diagnostics.closeSupportA11y")
                        : t("settings.diagnostics.backToErrorA11y")}
                      label={entryVariant === "support"
                        ? t("common.close")
                        : t("settings.diagnostics.backToDetails")}
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
                      accessibilityLabel={t("settings.diagnostics.shareA11y")}
                      disabled={shareBusy}
                      icon="share"
                      label={shareState === "sharing"
                        ? t("settings.diagnostics.shareOpening")
                        : shareState === "shared"
                          ? isAndroidSupportBundle
                            ? t("settings.diagnostics.shareOpenedAndroid")
                            : t("settings.diagnostics.shareRemovedIos")
                          : t("settings.diagnostics.shareButton")}
                      stretch
                      testID="settings-sync-support-bundle-share"
                      onPress={() => {
                        void shareSupportBundle();
                      }}
                    />
                  </View>

                  <View style={styles.block}>
                    <AppText variant="headline">{t("settings.diagnostics.includedFiles")}</AppText>
                    {bundleResult.files.map((file) => (
                      <View key={file} style={styles.readyFileRow}>
                        <Icon color={theme.colors.positive.s600} name="check" size={15} weight="semibold" />
                        <Text style={styles.fileName}>{file}</Text>
                      </View>
                    ))}
                  </View>

                  <Note title={t("settings.diagnostics.handoffTitle")}>
                    {isAndroidSupportBundle
                      ? t("settings.diagnostics.handoffAndroid")
                      : t("settings.diagnostics.handoffIos")}
                  </Note>

                  {shareState === "shared" ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      testID="settings-sync-support-bundle-shared"
                      tone="positive"
                      variant="footnote"
                    >
                      {isAndroidSupportBundle
                        ? t("settings.diagnostics.sharedAndroid")
                        : t("settings.diagnostics.sharedIos")}
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
                        ? t("settings.diagnostics.shareFailedAndroid")
                        : t("settings.diagnostics.shareFailedIos")}
                    </AppText>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaModalBackdrop>
      </AppModal>
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
