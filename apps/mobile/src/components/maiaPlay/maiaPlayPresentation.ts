import { Chess } from "chess.js";
import type {
  GameColor,
  MaiaGameEndReason,
  MaiaTimeClass,
  MaiaTimeControl
} from "../../../../../packages/core/src/index.ts";
import type { TranslateFn } from "../../i18n/index.ts";

export function formatMaiaClockMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const secs = Math.floor(clamped / 1000);
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:${String(secs).padStart(2, "0")}.${tenths}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatMaiaTimeControlDisplay(
  control: MaiaTimeControl,
  t: TranslateFn
): string {
  if (control.unlimited) {
    return t("maiaPlay.timeControl.unlimited");
  }
  return `${control.initialMinutes}+${control.incrementSeconds}`;
}

export function maiaTimeClassLabel(timeClass: MaiaTimeClass, t: TranslateFn): string {
  switch (timeClass) {
    case "blitz":
      return t("games.timeClass.blitz");
    case "rapid":
      return t("games.timeClass.rapid");
    case "classical":
      return t("games.timeClass.classical");
  }
}

export function maiaEndReasonLabel(
  reason: MaiaGameEndReason | undefined,
  t: TranslateFn
): string {
  switch (reason) {
    case "checkmate":
      return t("maiaPlay.endReason.checkmate");
    case "resign":
      return t("maiaPlay.endReason.resign");
    case "timeout":
      return t("maiaPlay.endReason.timeout");
    case "stalemate":
      return t("maiaPlay.endReason.stalemate");
    case "insufficient_material":
      return t("maiaPlay.endReason.insufficientMaterial");
    case "timeout_vs_insufficient_material":
      return t("maiaPlay.endReason.timeoutVsInsufficientMaterial");
    case "threefold_repetition":
      return t("maiaPlay.endReason.threefoldRepetition");
    case "fifty_move_rule":
      return t("maiaPlay.endReason.fiftyMoveRule");
    case "draw_agreement":
      return t("maiaPlay.endReason.drawAgreement");
    case "aborted":
      return t("maiaPlay.endReason.aborted");
    default:
      return "";
  }
}

const PIECE_VALUES: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

export function materialAdvantageFromFen(fen: string): { w: number; b: number } {
  try {
    const chess = new Chess(fen);
    let white = 0;
    let black = 0;
    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) {
          continue;
        }
        const val = PIECE_VALUES[piece.type] ?? 0;
        if (piece.color === "w") {
          white += val;
        } else {
          black += val;
        }
      }
    }
    return {
      w: Math.max(0, white - black),
      b: Math.max(0, black - white)
    };
  } catch {
    return { w: 0, b: 0 };
  }
}

export function colorBadgeSymbol(color: GameColor): string {
  return color === "w" ? "♔" : "♚";
}
