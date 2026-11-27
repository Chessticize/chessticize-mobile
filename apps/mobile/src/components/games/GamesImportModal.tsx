import React, { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import {
  type GameColor,
  type ImportedGameDraft
} from "../../../../../packages/core/src/index.ts";
import type {
  LinkedGameAccount,
  LinkedGameAccountPlatform
} from "../../../../../packages/storage/src/game-review-store.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { AppModal } from "../AppModal.tsx";
import { SafeAreaModalBackdrop } from "../SafeAreaModalBackdrop.tsx";
import { usePracticeViewport } from "../PracticeViewport.tsx";
import {
  AppText,
  Button,
  SegmentedControl,
  type SegmentOption
} from "../ui/index.tsx";
import { FilterButton } from "../practice/shared/FilterButton.tsx";
import { gamePlatformLabel } from "./gamesPresentation.ts";

export type GamesImportTab = "chess_com" | "lichess" | "pgn";

export interface GamesImportModalResult {
  inserted: number;
  skipped: number;
  games?: ImportedGameDraft[];
}

export interface GamesImportModalProps {
  visible: boolean;
  initialTab?: GamesImportTab;
  linkedAccounts: readonly LinkedGameAccount[];
  busy: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onClose: () => void;
  onLinkAndSync: (input: {
    platform: LinkedGameAccountPlatform;
    username: string;
    maxGames: number;
  }) => Promise<void>;
  onImportOlderForAccount?: (account: LinkedGameAccount) => Promise<void>;
  onRemoveAccount: (platform: LinkedGameAccountPlatform, username: string) => void;
  onImportPgn: (input: { pgnText: string; defaultUserColor: GameColor }) => void;
  onClearFeedback?: () => void;
}

const MAX_GAME_OPTIONS = [25, 50, 100] as const;

export function GamesImportModal({
  visible,
  initialTab = "chess_com",
  linkedAccounts,
  busy,
  errorMessage,
  statusMessage,
  onClose,
  onLinkAndSync,
  onImportOlderForAccount,
  onRemoveAccount,
  onImportPgn,
  onClearFeedback
}: GamesImportModalProps): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { height, width } = usePracticeViewport();

  const [activeTab, setActiveTab] = useState<GamesImportTab>(initialTab);
  const [username, setUsername] = useState("");
  const [maxGames, setMaxGames] = useState<number>(25);
  const [pgnText, setPgnText] = useState("");
  const [playerColor, setPlayerColor] = useState<GameColor>("w");

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setUsername("");
    }
  }, [initialTab, visible]);

  if (!visible) {
    return null;
  }

  const sourceOptions: readonly SegmentOption<GamesImportTab>[] = [
    {
      label: t("games.modal.sourceChessCom"),
      testID: "games-import-tab-chess-com",
      value: "chess_com"
    },
    {
      label: t("games.modal.sourceLichess"),
      testID: "games-import-tab-lichess",
      value: "lichess"
    },
    {
      label: t("games.modal.sourcePgn"),
      testID: "games-import-tab-pgn",
      value: "pgn"
    }
  ];

  const colorOptions: readonly SegmentOption<GameColor>[] = [
    { label: t("common.white"), testID: "games-import-color-white", value: "w" },
    { label: t("common.black"), testID: "games-import-color-black", value: "b" }
  ];

  const centered = width >= 600;
  const maxHeight = Math.max(300, height - 64);

  const handleSelectTab = (next: GamesImportTab): void => {
    setActiveTab(next);
    onClearFeedback?.();
  };

  const handleSubmitAccount = (): void => {
    const trimmed = username.trim();
    if (!trimmed || busy) {
      return;
    }
    const platform: LinkedGameAccountPlatform =
      activeTab === "lichess" ? "lichess" : "chess_com";
    void onLinkAndSync({ platform, username: trimmed, maxGames });
  };

  const handleSubmitPgn = (): void => {
    const trimmed = pgnText.trim();
    if (!trimmed || busy) {
      return;
    }
    onImportPgn({ pgnText: trimmed, defaultUserColor: playerColor });
  };

  return (
    <AppModal
      animationType="fade"
      transparent
      visible
      onRequestClose={onClose}
    >
      <SafeAreaModalBackdrop
        style={[
          styles.backdrop,
          { justifyContent: centered ? "center" : "flex-end" }
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { maxHeight }]}
          testID="games-import-modal"
        >
          <View style={styles.header}>
            <AppText accessibilityRole="header" variant="title">
              {t("games.modal.title")}
            </AppText>
            <Button
              accessibilityLabel={t("common.close")}
              label={t("common.close")}
              size="compact"
              testID="games-import-close"
              variant="plain"
              onPress={onClose}
            />
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
          >
            <SegmentedControl
              accessibilityLabel={t("games.modal.sourceA11y")}
              options={sourceOptions}
              testID="games-import-source-switcher"
              value={activeTab}
              onChange={handleSelectTab}
            />

            {errorMessage ? (
              <View style={styles.errorBanner} testID="games-import-error">
                <AppText style={styles.errorText} variant="subheadline">
                  {errorMessage}
                </AppText>
              </View>
            ) : null}

            {statusMessage ? (
              <View style={styles.statusBanner} testID="games-import-status">
                <AppText style={styles.statusText} variant="subheadline">
                  {statusMessage}
                </AppText>
              </View>
            ) : null}

            {activeTab === "chess_com" || activeTab === "lichess" ? (
              <View style={styles.formSection} testID="games-import-account-form">
                <View style={styles.field}>
                  <AppText tone="secondary" variant="footnote">
                    {t("games.modal.usernameLabel")}
                  </AppText>
                  <TextInput
                    accessibilityLabel={t("games.modal.usernameLabel")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    placeholder={t("games.modal.usernamePlaceholder")}
                    placeholderTextColor={theme.colors.text.tertiary}
                    returnKeyType="done"
                    style={styles.textInput}
                    testID="games-import-username-input"
                    value={username}
                    onChangeText={setUsername}
                    onSubmitEditing={handleSubmitAccount}
                  />
                </View>

                <View style={styles.field}>
                  <AppText tone="secondary" variant="footnote">
                    {t("games.modal.maxGamesLabel")}
                  </AppText>
                  <View style={styles.pillRow}>
                    {MAX_GAME_OPTIONS.map((count) => (
                      <FilterButton
                        key={count}
                        active={maxGames === count}
                        label={t("games.modal.maxGamesOption", { count })}
                        testID={`games-import-max-${count}`}
                        onPress={() => setMaxGames(count)}
                      />
                    ))}
                  </View>
                </View>

                <Button
                  disabled={busy || username.trim().length === 0}
                  label={busy ? t("games.action.syncing") : t("games.modal.linkAndSync")}
                  stretch
                  testID="games-import-link-submit"
                  onPress={handleSubmitAccount}
                />

                {linkedAccounts.length > 0 ? (
                  <View style={styles.linkedSection} testID="games-import-linked-accounts">
                    <AppText tone="secondary" variant="footnote">
                      {t("games.modal.linkedAccounts")}
                    </AppText>
                    <View style={styles.linkedList}>
                      {linkedAccounts.map((account) => {
                        const platformLabel = gamePlatformLabel(account.platform, locale);
                        return (
                          <View
                            key={`${account.platform}:${account.username}`}
                            style={styles.linkedRow}
                            testID={`games-linked-account-${account.platform}-${account.username}`}
                          >
                            <View style={styles.linkedRowCopy}>
                              <AppText variant="headline">{account.username}</AppText>
                              <AppText tone="secondary" variant="footnote">
                                {platformLabel}
                              </AppText>
                            </View>
                            <View style={styles.linkedRowActions}>
                              {onImportOlderForAccount ? (
                                <Button
                                  disabled={busy}
                                  label="+50 older"
                                  size="compact"
                                  testID={`games-import-older-${account.platform}-${account.username}`}
                                  variant="secondary"
                                  onPress={() => {
                                    void onImportOlderForAccount(account);
                                  }}
                                />
                              ) : null}
                              <Button
                                accessibilityLabel={t("games.modal.removeAccountA11y", {
                                  platform: platformLabel,
                                  username: account.username
                                })}
                                disabled={busy}
                                label={t("common.remove")}
                                size="compact"
                                testID={`games-remove-account-${account.platform}-${account.username}`}
                                variant="destructive"
                                onPress={() => onRemoveAccount(account.platform, account.username)}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.formSection} testID="games-import-pgn-form">
                <View style={styles.field}>
                  <AppText tone="secondary" variant="footnote">
                    {t("games.modal.playerColorLabel")}
                  </AppText>
                  <SegmentedControl
                    accessibilityLabel={t("games.modal.playerColorA11y")}
                    options={colorOptions}
                    semantics="radio"
                    testID="games-import-color-selector"
                    value={playerColor}
                    onChange={setPlayerColor}
                  />
                </View>

                <View style={styles.field}>
                  <AppText tone="secondary" variant="footnote">
                    {t("games.modal.pgnLabel")}
                  </AppText>
                  <TextInput
                    accessibilityLabel={t("games.modal.pgnLabel")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    multiline
                    numberOfLines={6}
                    placeholder={t("games.modal.pgnPlaceholder")}
                    placeholderTextColor={theme.colors.text.tertiary}
                    style={[styles.textInput, styles.pgnInput]}
                    testID="games-import-pgn-input"
                    textAlignVertical="top"
                    value={pgnText}
                    onChangeText={setPgnText}
                  />
                </View>

                <Button
                  disabled={busy || pgnText.trim().length === 0}
                  label={t("games.modal.importPgnSubmit")}
                  stretch
                  testID="games-import-pgn-submit"
                  onPress={handleSubmitPgn}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaModalBackdrop>
    </AppModal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimSoft,
    flex: 1,
    padding: 12
  },
  sheet: {
    backgroundColor: theme.colors.surfaceFloating,
    borderRadius: theme.shape.sheet,
    maxWidth: 540,
    overflow: "hidden",
    width: "100%"
  },
  header: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  body: {
    gap: 16,
    padding: 16
  },
  formSection: {
    gap: 14
  },
  field: {
    gap: 6
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  textInput: {
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    color: theme.colors.text.primary,
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  pgnInput: {
    minHeight: 132
  },
  errorBanner: {
    backgroundColor: theme.colors.danger.s100,
    borderRadius: theme.shape.control,
    padding: 12
  },
  errorText: {
    backgroundColor: theme.colors.danger.s100,
    color: theme.colors.danger.s600
  },
  statusBanner: {
    backgroundColor: theme.colors.positive.s100,
    borderRadius: theme.shape.control,
    padding: 12
  },
  statusText: {
    backgroundColor: theme.colors.positive.s100,
    color: theme.colors.positive.s600
  },
  linkedSection: {
    gap: 8,
    paddingTop: 4
  },
  linkedList: {
    gap: 8
  },
  linkedRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  linkedRowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  linkedRowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  }
}));
