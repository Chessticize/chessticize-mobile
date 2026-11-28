import type { GameColor, GameWinner } from "../game-import/types.ts";

export const MAIA_TIME_CLASSES = ["blitz", "rapid", "classical"] as const;
export type MaiaTimeClass = (typeof MAIA_TIME_CLASSES)[number];

export type MaiaColorPreference = "random" | GameColor;
export type MaiaThinkingPace = "human" | "instant";

export interface MaiaTimeControl {
  /** Base minutes per side; 0 when unlimited is true. */
  initialMinutes: number;
  /** Increment per move in seconds; 0 when unlimited is true. */
  incrementSeconds: number;
  /** Untimed Classical game. */
  unlimited: boolean;
}

export interface MaiaTimeControlPreset {
  id: string;
  label: string;
  timeClass: MaiaTimeClass;
  control: MaiaTimeControl;
}

export const MAIA_MIN_ESTIMATED_SECONDS = 180; // 3+0 Blitz floor; Bullet is intentionally excluded.
export const MAIA_DEFAULT_RATING = 1200;
export const MAIA_MIN_RATING = 600;
export const MAIA_MAX_OPPONENT_RATING = 2000;
export const MAIA_OPPONENT_RATING_STEP = 100;
export const MAIA_STARTING_RATING_PRESETS = [800, 1000, 1200, 1500, 1800] as const;

export const MAIA_TIME_CONTROL_PRESETS: readonly MaiaTimeControlPreset[] = [
  // Blitz (4)
  { id: "3+0", label: "3+0", timeClass: "blitz", control: { initialMinutes: 3, incrementSeconds: 0, unlimited: false } },
  { id: "3+2", label: "3+2", timeClass: "blitz", control: { initialMinutes: 3, incrementSeconds: 2, unlimited: false } },
  { id: "5+0", label: "5+0", timeClass: "blitz", control: { initialMinutes: 5, incrementSeconds: 0, unlimited: false } },
  { id: "5+3", label: "5+3", timeClass: "blitz", control: { initialMinutes: 5, incrementSeconds: 3, unlimited: false } },
  // Rapid (4)
  { id: "10+0", label: "10+0", timeClass: "rapid", control: { initialMinutes: 10, incrementSeconds: 0, unlimited: false } },
  { id: "10+5", label: "10+5", timeClass: "rapid", control: { initialMinutes: 10, incrementSeconds: 5, unlimited: false } },
  { id: "15+0", label: "15+0", timeClass: "rapid", control: { initialMinutes: 15, incrementSeconds: 0, unlimited: false } },
  { id: "15+10", label: "15+10", timeClass: "rapid", control: { initialMinutes: 15, incrementSeconds: 10, unlimited: false } },
  // Classical (4)
  { id: "30+0", label: "30+0", timeClass: "classical", control: { initialMinutes: 30, incrementSeconds: 0, unlimited: false } },
  { id: "30+20", label: "30+20", timeClass: "classical", control: { initialMinutes: 30, incrementSeconds: 20, unlimited: false } },
  { id: "60+0", label: "60+0", timeClass: "classical", control: { initialMinutes: 60, incrementSeconds: 0, unlimited: false } },
  { id: "unlimited", label: "Unlimited", timeClass: "classical", control: { initialMinutes: 0, incrementSeconds: 0, unlimited: true } }
];

export const DEFAULT_MAIA_TIME_CONTROL: MaiaTimeControl = {
  initialMinutes: 10,
  incrementSeconds: 0,
  unlimited: false
};

export interface MaiaSetupPreferences {
  timeControl: MaiaTimeControl;
  rated: boolean;
  /** Used when rated === false; ignored (locked to player rating) when rated === true. */
  opponentRating: number;
  colorPreference: MaiaColorPreference;
  thinkingPace: MaiaThinkingPace;
}

export const DEFAULT_MAIA_SETUP_PREFERENCES: MaiaSetupPreferences = {
  timeControl: DEFAULT_MAIA_TIME_CONTROL,
  rated: true,
  opponentRating: MAIA_DEFAULT_RATING,
  colorPreference: "random",
  thinkingPace: "human"
};

export interface MaiaRatingRecord {
  timeClass: MaiaTimeClass;
  rating: number;
  ratingDeviation: number;
  volatility: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  updatedAt: string;
}

export type MaiaGameStatus = "playing" | "finished" | "aborted";

export type MaiaGameEndReason =
  | "checkmate"
  | "resign"
  | "timeout"
  | "stalemate"
  | "insufficient_material"
  | "timeout_vs_insufficient_material"
  | "threefold_repetition"
  | "fifty_move_rule"
  | "draw_agreement"
  | "aborted";

export interface MaiaGameMoveRecord {
  ply: number;
  color: GameColor;
  uci: string;
  san: string;
  fenAfter: string;
  clockRemainingMs: number | null;
  thinkTimeMs: number;
  playedAtIso: string;
}

export interface MaiaGameClocksMs {
  w: number;
  b: number;
}

export interface MaiaGameState {
  id: string;
  startedAt: string;
  endedAt?: string;
  timeControl: MaiaTimeControl;
  timeClass: MaiaTimeClass;
  rated: boolean;
  userColor: GameColor;
  userRatingBefore: number;
  userRatingAfter?: number;
  userRatingChange?: number;
  maiaRating: number;
  thinkingPace: MaiaThinkingPace;
  initialFen: string;
  currentFen: string;
  moves: MaiaGameMoveRecord[];
  clocksMs: MaiaGameClocksMs | null;
  /** Wall-clock ms when the current turn's clock began ticking (null while paused or untimed). */
  turnStartedAtMs: number | null;
  status: MaiaGameStatus;
  winner: GameWinner;
  endReason?: MaiaGameEndReason;
  /** Tracks whether a draw offer was already declined on the current move ply. */
  drawDeclinedAtPly?: number;
  /** ID of the saved row in `imported_games` once finished. */
  savedGameId?: string;
}
