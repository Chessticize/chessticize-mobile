export type MoveSide = "w" | "b";

export function moveSideDisplayName(side: MoveSide): "Black" | "White" {
  return side === "b" ? "Black" : "White";
}

export function sideToMove(fen: string): MoveSide {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function sideToMoveLabel(side: MoveSide): "White" | "Black" {
  return side === "b" ? "Black" : "White";
}

export function sideToMoveAccessibilityLabel(side: MoveSide): string {
  return `${sideToMoveLabel(side)} to move`;
}

function oppositeMoveSide(side: MoveSide): MoveSide {
  return side === "b" ? "w" : "b";
}
