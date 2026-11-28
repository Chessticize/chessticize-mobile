import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classifyMaiaTimeControl,
  createMaiaGameState,
  type HumanPolicyModel,
  type MaiaGameState,
  type MaiaRatingRecord,
  type MaiaSetupPreferences,
  type MaiaThinkingPace,
  type MaiaTimeClass
} from "../../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import type { MoveFeedbackClient } from "../../platform/moveFeedback.ts";
import { createNativeHumanPolicyModel } from "../../platform/nativeHumanPolicy.ts";
import { MaiaPlayGameView, type MaiaPlayBoardComponent } from "./MaiaPlayGameView.tsx";
import { MaiaPlaySetupView } from "./MaiaPlaySetupView.tsx";

export interface MaiaPlayScreenProps {
  service: PracticeService;
  policyModel?: HumanPolicyModel | null;
  moveFeedbackClient?: MoveFeedbackClient | null;
  BoardComponent?: MaiaPlayBoardComponent;
  initialMode?: "setup" | "resume_if_active";
  onOpenGameReview: (savedGameId: string) => void;
  onStoreMutated?: () => void;
  onBack: () => void;
}

function makeGameId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function MaiaPlayScreen({
  service,
  policyModel: injectedPolicyModel,
  moveFeedbackClient = null,
  BoardComponent,
  initialMode = "resume_if_active",
  onOpenGameReview,
  onStoreMutated,
  onBack
}: MaiaPlayScreenProps): React.JSX.Element {
  const [revision, setRevision] = useState(0);
  const [preferences, setPreferences] = useState<MaiaSetupPreferences>(() =>
    service.getMaiaSetupPreferences()
  );
  const preferencesRef = useRef<MaiaSetupPreferences>(preferences);
  preferencesRef.current = preferences;

  const initialResumable = useMemo(() => {
    const saved = service.getActiveMaiaGame();
    return saved && saved.status === "playing" ? saved : null;
  }, [service]);

  const [activeGame, setActiveGame] = useState<MaiaGameState | null>(() =>
    initialMode === "resume_if_active" ? initialResumable : null
  );
  const [view, setView] = useState<"setup" | "game">(() =>
    initialMode === "resume_if_active" && initialResumable ? "game" : "setup"
  );

  // Lazy native Maia-2 model lifecycle (unloaded cleanly on unmount when owned by this screen).
  const ownedNativeModelRef = useRef<ReturnType<typeof createNativeHumanPolicyModel>>(null);
  const resolvedPolicyModel = useMemo<HumanPolicyModel | null>(() => {
    if (injectedPolicyModel !== undefined) {
      return injectedPolicyModel;
    }
    ownedNativeModelRef.current ??= createNativeHumanPolicyModel();
    return ownedNativeModelRef.current;
  }, [injectedPolicyModel]);

  useEffect(() => {
    return () => {
      void ownedNativeModelRef.current?.unload();
      ownedNativeModelRef.current = null;
    };
  }, []);

  const ratingsByClass = useMemo<Record<MaiaTimeClass, MaiaRatingRecord>>(() => {
    void revision;
    return {
      blitz: service.getMaiaRating("blitz"),
      rapid: service.getMaiaRating("rapid"),
      classical: service.getMaiaRating("classical")
    };
  }, [revision, service]);

  const storedResumable = useMemo(() => {
    void revision;
    const saved = service.getActiveMaiaGame();
    return saved && saved.status === "playing" ? saved : null;
  }, [revision, service]);

  const handlePatchPreferences = useCallback(
    (patch: Partial<MaiaSetupPreferences>) => {
      const next: MaiaSetupPreferences = {
        ...preferencesRef.current,
        ...patch
      };
      preferencesRef.current = next;
      setPreferences(next);
      service.saveMaiaSetupPreferences(next);
      onStoreMutated?.();
    },
    [onStoreMutated, service]
  );

  const handleChangeInitialRating = useCallback(
    (timeClass: MaiaTimeClass, rating: number) => {
      service.setInitialMaiaRating(timeClass, rating);
      setRevision((r) => r + 1);
      onStoreMutated?.();
    },
    [onStoreMutated, service]
  );

  const startNewGameWithPrefs = useCallback(
    (prefs: MaiaSetupPreferences) => {
      const timeClass = classifyMaiaTimeControl(prefs.timeControl);
      const ratingRecord = service.getMaiaRating(timeClass);
      const game = createMaiaGameState({
        id: makeGameId(),
        preferences: prefs,
        userRating: ratingRecord.rating
      });
      service.saveMaiaSetupPreferences(prefs);
      service.saveActiveMaiaGame(game);
      setActiveGame(game);
      setView("game");
      setRevision((r) => r + 1);
      onStoreMutated?.();
    },
    [onStoreMutated, service]
  );

  const handleStartGame = useCallback(() => {
    startNewGameWithPrefs(preferencesRef.current);
  }, [startNewGameWithPrefs]);

  const handleResumeGame = useCallback(() => {
    const saved = service.getActiveMaiaGame();
    if (saved && saved.status === "playing") {
      setActiveGame(saved);
      setView("game");
    }
  }, [service]);

  const handlePersistState = useCallback(
    (state: MaiaGameState) => {
      service.saveActiveMaiaGame(state);
      setActiveGame(state);
    },
    [service]
  );

  const handleFinishGame = useCallback(
    (state: MaiaGameState): MaiaGameState => {
      const completed = service.completeMaiaGame(state);
      setActiveGame(completed.state);
      setRevision((r) => r + 1);
      onStoreMutated?.();
      return completed.state;
    },
    [onStoreMutated, service]
  );

  const handleThinkingPaceChanged = useCallback(
    (thinkingPace: MaiaThinkingPace) => {
      const nextPrefs: MaiaSetupPreferences = {
        ...preferencesRef.current,
        thinkingPace
      };
      preferencesRef.current = nextPrefs;
      setPreferences(nextPrefs);
      service.saveMaiaSetupPreferences(nextPrefs);
    },
    [service]
  );

  const handleRematch = useCallback(() => {
    const current = preferencesRef.current;
    const nextPrefs: MaiaSetupPreferences =
      current.colorPreference === "w"
        ? { ...current, colorPreference: "b" }
        : current.colorPreference === "b"
          ? { ...current, colorPreference: "w" }
          : current;
    preferencesRef.current = nextPrefs;
    setPreferences(nextPrefs);
    startNewGameWithPrefs(nextPrefs);
  }, [startNewGameWithPrefs]);

  if (view === "game" && activeGame) {
    return (
      <MaiaPlayGameView
        key={activeGame.id}
        BoardComponent={BoardComponent}
        initialState={activeGame}
        moveFeedbackClient={moveFeedbackClient}
        moveFeedbackSettings={service.getSettings().moveFeedback}
        policyModel={resolvedPolicyModel}
        onExit={() => {
          setRevision((r) => r + 1);
          onBack();
        }}
        onFinishGame={handleFinishGame}
        onNewSetup={() => {
          setRevision((r) => r + 1);
          setView("setup");
        }}
        onPersistState={handlePersistState}
        onRematch={handleRematch}
        onReviewGame={onOpenGameReview}
        onThinkingPaceChanged={handleThinkingPaceChanged}
      />
    );
  }

  return (
    <MaiaPlaySetupView
      activeGame={storedResumable}
      preferences={preferences}
      ratingsByClass={ratingsByClass}
      onBack={onBack}
      onChangeInitialRating={handleChangeInitialRating}
      onPatchPreferences={handlePatchPreferences}
      onResumeGame={handleResumeGame}
      onStartGame={handleStartGame}
    />
  );
}
