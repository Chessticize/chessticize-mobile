export const GAME_REVIEW_COPY = {
  header: {
    backLabel: "Back",
    engineToggle: "Engine",
    engineActiveLabel: "Engine on",
    flipBoardLabel: "Flip board",
    modeAccessibilityLabel: "Game review mode",
    modeKeyMoments: "Key Moments",
    modeMoves: "Moves",
    summaryToggle: "Summary"
  },
  status: {
    scanningPass1: (completed: number, total: number) =>
      `Analyzing game · ${completed}/${total}`,
    extractingPass2: "Finding key moments…",
    pausedAtCheckpoint: (checkpointPly: number, total: number) =>
      `Paused at ply ${checkpointPly}/${total}`,
    resumeScan: "Resume",
    analysisError: "Analysis paused due to an engine error",
    retryScan: "Retry",
    offlineReady: "Offline review ready",
    noMoves: "This game has no moves to review."
  },
  evalBar: {
    accessibilityLabel: (evalLabel: string, whiteWinPercent: number) =>
      `Evaluation ${evalLabel}, White winning chances ${Math.round(whiteWinPercent)} percent`
  },
  evalGraph: {
    accessibilityLabel: "Evaluation graph",
    emptyLabel: "Evaluating positions…",
    pointAccessibilityLabel: (moveLabel: string, evalLabel: string, classificationLabel: string) =>
      `${moveLabel}, evaluation ${evalLabel}, ${classificationLabel}`
  },
  classifications: {
    book: "Book",
    best: "Best",
    great: "Great",
    good: "Good",
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    blunder: "Blunder",
    missed_win: "Missed Win"
  },
  keyMoments: {
    emptyScanning: "Key moments will appear once analysis finishes.",
    emptyNone: "Clean game — no critical mistakes found.",
    counter: (current: number, total: number) => `Key Moment ${current} / ${total}`,
    prev: "Prev",
    next: "Next",
    skip: "Skip",
    arrowDuelCue: (playedSan: string) => `You played ${playedSan} — choose the better move`,
    arrowDuelCueFallback: "Choose the better move",
    lineCue: (playedSan?: string) =>
      playedSan ? `You played ${playedSan} — find the best move` : "Find the best continuation",
    lineContinuationCue: "Keep going — find the next move",
    escapedTag: "Opponent missed punishment",
    solvedTitle: "Great find!",
    failedTitle: "Not quite",
    skippedTitle: "Skipped",
    bestMoveReveal: (bestSan: string, bestEval?: string) =>
      bestEval ? `Best: ${bestSan} (${bestEval})` : `Best: ${bestSan}`,
    evalComparison: (bestEval: string, playedEval: string) =>
      `Best ${bestEval} vs Played ${playedEval}`,
    showRefutation: "Show refutation",
    hideRefutation: "Hide refutation",
    punishmentLineTitle: "Punishment line",
    stepBack: "Prev",
    stepForward: "Next",
    addToReview: "Add to Review",
    inReview: "In Review",
    addedToReview: "Added to Review",
    removeFromReview: "Remove",
    retryAgain: "Retry",
    highlightTitle: "Great catch!",
    highlightDetail: (moveLabel: string, san: string) =>
      `You punished the mistake with ${moveLabel} ${san}`
  },
  moveStrip: {
    startLabel: "Start",
    firstMoveA11y: "Jump to start",
    prevMoveA11y: "Previous move",
    nextMoveA11y: "Next move",
    lastMoveA11y: "Jump to end",
    flipBoardA11y: "Flip board"
  },
  enginePanel: {
    title: "Live Stockfish",
    thinking: "Calculating…",
    unavailable: "Engine unavailable",
    depthLabel: (depth: number) => `d${depth}`,
    backToGame: "Back to game",
    exploringOffset: (plies: number) => `+${plies} explored`,
    playLineA11y: (san: string, score: string) => `Play engine move ${san}, evaluation ${score}`
  },
  summary: {
    title: "Game Summary",
    whiteLabel: "White",
    blackLabel: "Black",
    accuracyLabel: (value: number) => `${Math.round(value)}%`,
    puzzlesTitle: (count: number) =>
      count === 1 ? "1 Puzzle From This Game" : `${count} Puzzles From This Game`,
    noPuzzles: "No tactical puzzles generated for this game.",
    kindLine: "Line",
    kindArrowDuel: "Arrow Duel",
    moveNumberLabel: (moveNumber: number) => `Move ${moveNumber}`,
    practiceGamePuzzles: "Practice this game's puzzles",
    addToReview: "Add to Review",
    inReview: "In Review"
  }
} as const;
