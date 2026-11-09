export type MoveSide = "w" | "b";

function moveSideDisplayName(side: MoveSide): "Black" | "White" {
  return side === "b" ? "Black" : "White";
}

function sideToMove(fen: string): MoveSide {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function sideToMoveLabel(side: MoveSide): "White" | "Black" {
  return side === "b" ? "Black" : "White";
}

function sideToMoveAccessibilityLabel(side: MoveSide): string {
  return `${sideToMoveLabel(side)} to move`;
}
