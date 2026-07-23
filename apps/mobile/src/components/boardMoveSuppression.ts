export type UciBoardMove = {
  from: string;
  to: string;
  promotion?: string;
};

export function boardMoveToUci(move: UciBoardMove): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
}

export function consumeSuppressedBoardMove(
  move: string,
  suppressedMoves: string[]
): boolean {
  const normalizedMove = move.toLowerCase();
  const index = suppressedMoves.findIndex(
    (suppressedMove) => suppressedMove.toLowerCase() === normalizedMove
  );
  if (index === -1) {
    return false;
  }
  suppressedMoves.splice(index, 1);
  return true;
}
