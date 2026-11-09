  const reminderScheduleKeyRef = useRef<string | null>(null);

  const reviewReminderPromptDismissedRef = useRef(false);
  const iCloudSyncInFlightRef = useRef<Promise<string> | null>(null);
  const iCloudSyncGenerationRef = useRef(0);

  const [reviewReminderPreference, setReviewReminderPreference] = useState<ReviewReminderPreference>(() => service.getReviewReminderPreference());
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<ReviewReminderPermissionStatus>("unavailable");
  const [reviewReminderScheduleStatus, setReviewReminderScheduleStatus] = useState("unavailable");
  const [reviewReminderPermissionPromptVisible, setReviewReminderPermissionPromptVisible] = useState(false);

  const [settingsAdvancedRatingsOpen, setSettingsAdvancedRatingsOpen] = useState(false);

  const [iCloudSyncEnabled, setICloudSyncEnabled] = useState(() => service.getSettings().sync.iCloudEnabled);
  const [iCloudSyncStatus, setICloudSyncStatus] = useState(() => service.getSettings().sync.iCloudEnabled ? "Ready" : "Off");
  const [iCloudSyncInProgress, setICloudSyncInProgress] = useState(false);

  const iCloudAccountStatusRef =
    useRef<ICloudAccountStatus | "not_checked">("not_checked");
  const [lastICloudSyncFailure, setLastICloudSyncFailure] =
    useState<ICloudSyncFailureDiagnostic | undefined>();
  const [moveFeedbackPreferences, setMoveFeedbackPreferences] = useState<MoveFeedbackPreferences>(
    () => service.getSettings().moveFeedback
  );
  const [appearance, setAppearancePreference] = useState<AppearancePreference>(
    () => service.getSettings().appearance
  );
  const { setAppearance } = useAppearance();

  const progressV2Diagnostics = service.getProgressV2Diagnostics();
  const activeProgressV2Phase = resolveProgressV2ActivePhase(progressV2Diagnostics.phase);
  const syncDiagnosticMetadata = {
    appVersion: platformCapabilities.applicationMetadata.versionName,
    ...(platformCapabilities.applicationMetadata.buildNumber
      ? { buildNumber: platformCapabilities.applicationMetadata.buildNumber }
      : {}),
    iCloudAccountStatus: iCloudAccountStatusRef.current,
    iCloudSyncEnabled,
    latestSyncStatus: iCloudSyncStatus,
    progressV2: {
      phase: activeProgressV2Phase,
      zoneInitialized: progressV2Diagnostics.zoneInitialized,
      ...(progressV2Diagnostics.serverChangeTokenFingerprint === undefined
        ? {}
        : { serverChangeTokenFingerprint: progressV2Diagnostics.serverChangeTokenFingerprint }),
      pendingOutboxCount: progressV2Diagnostics.pendingOutboxCount,
      ...(progressV2Diagnostics.oldestPendingOutboxAt === undefined
        ? {}
        : { oldestPendingOutboxAt: progressV2Diagnostics.oldestPendingOutboxAt }),
      ...(progressV2Diagnostics.lastPullAt === undefined
        ? {}
        : { lastPullAt: progressV2Diagnostics.lastPullAt }),
      ...(progressV2Diagnostics.lastPushAt === undefined
        ? {}
        : { lastPushAt: progressV2Diagnostics.lastPushAt }),
      legacyImportPending: progressV2Diagnostics.pendingV1ChangeTag !== undefined,
      ...(progressV2Diagnostics.lastV1ChangeTag === undefined
        ? {}
        : {
            lastV1ChangeTagFingerprint: fingerprintOpaqueToken(
              progressV2Diagnostics.lastV1ChangeTag
            )
          }),
      ...(progressV2Diagnostics.lastV1ImportAt === undefined
        ? {}
        : { lastV1ImportAt: progressV2Diagnostics.lastV1ImportAt }),
      ...(progressV2Diagnostics.lastV1CheckAt === undefined
        ? {}
        : { lastV1CheckAt: progressV2Diagnostics.lastV1CheckAt }),
      ...(progressV2Diagnostics.lastV1CheckStatus === undefined
        ? {}
        : { lastV1CheckStatus: progressV2Diagnostics.lastV1CheckStatus })
    }
  };
  const supportDiagnosticMetadata: SupportDiagnosticMetadata =
    progressProtection.kind === "android_managed_backup"
      ? {
          appVersion: platformCapabilities.applicationMetadata.versionName,
          ...(platformCapabilities.applicationMetadata.buildNumber
            ? { buildNumber: platformCapabilities.applicationMetadata.buildNumber }
            : {}),
          platform: "android",
          progressProtection: "android_managed_backup"
        }
      : syncDiagnosticMetadata;
  const generatedSupportBundle = iCloudSyncDiagnosticsClient
    ? {
        onDiscard: async (result) => {
          if (result.bundleUrl) {
            await iCloudSyncDiagnosticsClient.discardSupportBundle(result.bundleUrl);
          }
        },
        onPrepare: async () => {
          const createdAt = new Date(currentTimeMs()).toISOString();
          const cloudCapture = progressProtection.kind === "android_managed_backup"
            ? undefined
            : iCloudSyncClient
              ? await captureProgressForSupport(
                  iCloudSyncClient,
                  activeProgressV2Phase
                )
              : {
                  formatVersion: 2 as const,
                  accountStatus: "unavailable" as const,
                  v2: {
                    status: "unavailable" as const,
                    ndjson: "",
                    recordCount: 0,
                    deletionCount: 0,
                    familyCounts: {},
                    bytes: 0,
                    startedAt: createdAt,
                    completedAt: createdAt,
                    unavailableReason: "icloud_v2_transport_unavailable"
                  },
                  v1: {
                    status: activeProgressV2Phase === "sealed"
                      ? "skipped_sealed" as const
                      : "unavailable" as const,
                    ...(activeProgressV2Phase === "sealed"
                      ? {}
                      : { unavailableReason: "icloud_v1_transport_unavailable" })
                  }
                };
          const preparedMetadata: SupportDiagnosticMetadata =
            progressProtection.kind === "android_managed_backup"
              ? supportDiagnosticMetadata
              : {
                  ...syncDiagnosticMetadata,
                  iCloudAccountStatus: cloudCapture?.accountStatus ?? "unavailable"
                };
          const prepared = await iCloudSyncDiagnosticsClient.prepareSupportBundle({
            ...(cloudCapture === undefined ? {} : { cloudCapture }),
            diagnosticText: progressProtection.kind === "android_managed_backup"
              ? formatAndroidSupportOverviewDiagnostic(
                  preparedMetadata,
                  createdAt
                )
              : formatICloudSyncOverviewDiagnostic(
                  preparedMetadata as ICloudSyncDiagnosticMetadata,
                  createdAt,
                  lastICloudSyncFailure
                ),
            metadata: preparedMetadata
          });
          return prepared;
        },
        onShare: async (result) => {
          if (!result.bundleUrl) {
            throw new Error("The prepared support bundle is unavailable.");
          }
          await iCloudSyncDiagnosticsClient.shareSupportBundle(result.bundleUrl);
        },
        platform: progressProtection.kind === "android_managed_backup"
          ? "android"
          : "ios"
      } satisfies ICloudSyncSupportBundlePresentation
    : undefined;
  const effectiveSupportBundle = iCloudSyncSupportBundle ?? generatedSupportBundle;
  const generatedErrorDetails = lastICloudSyncFailure && iCloudSyncStatus === "iCloud sync failed"
    ? {
        copyText: formatICloudSyncFailureDiagnostic(
          lastICloudSyncFailure,
          syncDiagnosticMetadata
        ),
        message: lastICloudSyncFailure.message,
        occurredAtLabel: new Date(lastICloudSyncFailure.occurredAt).toLocaleString(),
        onCopy: async (text: string) => {
          if (!iCloudSyncDiagnosticsClient) {
            throw new Error("Clipboard access is unavailable.");
          }
          await iCloudSyncDiagnosticsClient.copyText(text);
        },
        supportBundle: effectiveSupportBundle
      } satisfies ICloudSyncErrorDetailsPresentation
    : undefined;
  const effectiveErrorDetails = iCloudSyncErrorDetails ?? generatedErrorDetails;

  useEffect(() => {
    const enabled = service.getSettings().sync.iCloudEnabled;
    setICloudSyncEnabled(enabled);
    if (!enabled) {
      setICloudSyncStatus("Off");
      return;
    }
    if (!iCloudSyncClient) {
      setICloudSyncStatus("Unavailable on this build");
      return;
    }
    setICloudSyncStatus("Ready");
    void runICloudProgressSync("startup");
    // Sync is intentionally triggered only when the client or backing service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iCloudSyncClient, service]);

  function saveReviewReminderPreference(preference: ReviewReminderPreference): void {
    const saved = service.saveReviewReminderPreference(preference);
    setReviewReminderPreference(saved);
    setSettingsRevision((current) => current + 1);
    refreshReviewReminder("settings", true);
  }

  async function requestReviewReminderPermission(): Promise<ReviewReminderPermissionStatus> {
    if (!notificationClient) {
      setNotificationPermissionStatus("unavailable");
      return "unavailable";
    }
    try {
      const status = await notificationClient.requestAuthorization();
      setNotificationPermissionStatus(status);
      const finishPermissionPrompt = () => {
        setReviewReminderPermissionPromptVisible(false);
        reviewReminderPromptDismissedRef.current = true;
      };
      if (!deferBackRelevantTransition("review-reminder-permission", finishPermissionPrompt)) {
        finishPermissionPrompt();
      }
      if (status === "authorized") {
        refreshReviewReminder("permission", true);
      }
      return status;
    } catch {
      setNotificationPermissionStatus("unavailable");
      return "unavailable";
    }
  }

  async function openReviewReminderSystemSettings(): Promise<void> {
    if (!notificationClient) {
      return;
    }
    await notificationClient.openSystemSettings();
    try {
      setNotificationPermissionStatus(await notificationClient.getAuthorizationStatus());
    } catch {
      setNotificationPermissionStatus("unavailable");
    }
  }

  function saveICloudSyncEnabled(enabled: boolean): void {
    iCloudSyncGenerationRef.current += 1;
    iCloudSyncInFlightRef.current = null;
    setICloudSyncInProgress(false);
    service.saveSettings({
      ...service.getSettings(),
      sync: {
        iCloudEnabled: enabled
      }
    });
    setICloudSyncEnabled(enabled);
    setSettingsRevision((current) => current + 1);
    if (!enabled) {
      setICloudSyncStatus("Off");
      return;
    }
    setICloudSyncStatus(iCloudSyncClient ? "Ready" : "Unavailable on this build");
    if (iCloudSyncClient) {
      void runICloudProgressSync("settings-enabled");
    }
  }

  function saveMoveFeedbackPreferences(preferences: MoveFeedbackPreferences): void {
    const saved = service.saveSettings({
      ...service.getSettings(),
      moveFeedback: preferences
    });
    setMoveFeedbackPreferences(saved.moveFeedback);
    setSettingsRevision((current) => current + 1);
  }

  function saveAppearance(next: AppearancePreference): void {
    const saved = service.saveSettings({
      ...service.getSettings(),
      appearance: next
    });
    setAppearancePreference(saved.appearance);
    setAppearance(saved.appearance);
  }

  async function runICloudProgressSync(reason: string): Promise<string> {
    if (!service.getSettings().sync.iCloudEnabled) {
      setICloudSyncStatus("Off");
      return "iCloud sync is off";
    }
    if (!iCloudSyncClient) {
      setICloudSyncStatus("Unavailable on this build");
      return "iCloud sync is unavailable on this build";
    }
    if (iCloudSyncInFlightRef.current) {
      return iCloudSyncInFlightRef.current;
    }

    const generation = iCloudSyncGenerationRef.current;
    const isCurrent = () =>
      generation === iCloudSyncGenerationRef.current &&
      service.getSettings().sync.iCloudEnabled;

    const work = (async () => {
      setICloudSyncInProgress(true);
      try {
        const accountStatus = await iCloudSyncClient.getAccountStatus();
        if (!isCurrent()) {
          setICloudSyncStatus("Off");
          return "iCloud sync is off";
        }
        iCloudAccountStatusRef.current = accountStatus;
        if (accountStatus !== "available") {
          const message = iCloudAccountStatusMessage(accountStatus);
          setICloudSyncStatus(message);
          return message;
        }
        const result = await syncPracticeProgressV2(service, iCloudSyncClient, {
          desiredPhase: PROGRESS_V2_RELEASE_PHASE,
          deviceId: "ios-mobile",
          now: nowIso,
          isCurrent
        });
        refreshState();
        setICloudSyncEnabled(service.getSettings().sync.iCloudEnabled);
        setSettingsRevision((current) => current + 1);
        const message = progressSyncStatusMessage(result);
        setICloudSyncStatus(message);
        return message;
      } catch (caught) {
        if (caught instanceof ProgressV2SyncCancelledError) {
          const message = service.getSettings().sync.iCloudEnabled ? "Ready" : "Off";
          setICloudSyncStatus(message);
          return message === "Off" ? "iCloud sync is off" : "iCloud sync was superseded";
        }
        const message = "iCloud sync failed";
        setLastICloudSyncFailure(captureICloudSyncFailure(caught, {
          attempt: iCloudSyncAttemptLabel(reason),
          occurredAt: new Date(currentTimeMs()).toISOString()
        }));
        setICloudSyncStatus(message);
        emitTrace({
          type: "move-ignored",
          reason: `icloud-sync-${reason}-failed:${errorMessage(caught)}`
        });
        return message;
      }
    })();

    iCloudSyncInFlightRef.current = work;
    void work.finally(() => {
      if (iCloudSyncInFlightRef.current === work) {
        iCloudSyncInFlightRef.current = null;
        setICloudSyncInProgress(false);
      }
    });
    return work;
  }

  function maybeShowReviewReminderPermissionPrompt(): void {
    if (
      !notificationClient ||
      reviewReminderPromptDismissedRef.current ||
      reviewReminderPreference.mode === "off" ||
      notificationPermissionStatus !== "not_determined"
    ) {
      return;
    }
    const showPermissionPrompt = () => setReviewReminderPermissionPromptVisible(true);
    if (!deferBackRelevantTransition("review-reminder-permission", showPermissionPrompt)) {
      showPermissionPrompt();
    }
  }

  function dismissReviewReminderPermissionPrompt(): void {
    reviewReminderPromptDismissedRef.current = true;
    setReviewReminderPermissionPromptVisible(false);
  }

  function refreshReviewReminder(reason: string, force = false): void {
    if (!scheduler) {
      setReviewReminderScheduleStatus("unavailable");
      return;
    }
    try {
      const decision = computeReviewReminderDecision(service, nowIso());
      const nextKey = reminderScheduleKey(decision);
      if (!force && reminderScheduleKeyRef.current === nextKey) {
        return;
      }
      reminderScheduleKeyRef.current = nextKey;
      setReviewReminderScheduleStatus("pending");
      void scheduler.replaceNextReminder(decision).then((result) => {
        setReviewReminderScheduleStatus(reviewReminderScheduleStatusLabel(decision, result));
      }).catch((caught) => {
        setReviewReminderScheduleStatus("error");
        emitTrace({
          type: "move-ignored",
          reason: `review-reminder-${reason}-failed:${errorMessage(caught)}`
        });
      });
    } catch (caught) {
      setReviewReminderScheduleStatus("error");
      emitTrace({
        type: "move-ignored",
        reason: `review-reminder-${reason}-failed:${errorMessage(caught)}`
      });
    }
  }

  async function scheduleDevReviewReminderNotification(): Promise<ReviewReminderScheduleResult> {
    if (!scheduler) {
      setReviewReminderScheduleStatus("unavailable");
      return { scheduled: false };
    }
    const dueCount = Math.max(1, service.getDueReviewItems(nowIso()).length);
    const decision: ReviewReminderDecision = {
      scheduledAt: new Date(nowMsRef.current + 5000).toISOString(),
      targetLocalDateTime: localReminderTarget(new Date(nowMsRef.current + 5000)),
      dueCount,
      body: `${reviewCountLabel(dueCount)} ${dueCount === 1 ? "is" : "are"} ready`,
      route: "review",
      workloadState: "due_today"
    };
    reminderScheduleKeyRef.current = reminderScheduleKey(decision);
    setReviewReminderScheduleStatus("pending");
    try {
      const result = await scheduler.replaceNextReminder(decision);
      setReviewReminderScheduleStatus(reviewReminderScheduleStatusLabel(decision, result));
      return result;
    } catch (caught) {
      setReviewReminderScheduleStatus("error");
      emitTrace({
        type: "move-ignored",
        reason: `review-reminder-dev-test-failed:${errorMessage(caught)}`
      });
      return { scheduled: false };
    }
  }
