import { getActiveLocale, translate } from "../../../i18n/translate.ts";
import type { SupportedLocale } from "../../../../../../packages/core/src/index.ts";

export type MoveSide = "w" | "b";

export function moveSideDisplayName(
  side: MoveSide,
  locale: SupportedLocale = getActiveLocale()
): string {
  return translate(locale, side === "b" ? "common.black" : "common.white");
}

export function sideToMove(fen: string): MoveSide {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function sideToMoveAccessibilityLabel(
  side: MoveSide,
  locale: SupportedLocale = getActiveLocale()
): string {
  return translate(locale, "chess.sideToMove", { side: moveSideDisplayName(side, locale) });
}

export function oppositeMoveSide(side: MoveSide): MoveSide {
  return side === "b" ? "w" : "b";
}
