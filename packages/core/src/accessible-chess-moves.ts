import { Chess, type PieceSymbol, type Square } from "chess.js";

export type AccessibleMoveOption = {
  from: Square;
  label: string;
  promotion?: PieceSymbol;
  san: string;
  to: Square;
  uci: string;
};

const PROMOTION_ORDER: ReadonlyArray<PieceSymbol> = ["q", "r", "b", "n"];
const PROMOTION_LABELS: Readonly<Record<PieceSymbol, string>> = {
  b: "bishop",
  k: "king",
  n: "knight",
  p: "pawn",
  q: "queen",
  r: "rook"
};

export function buildAccessibleMoveOptions(fen: string | null | undefined): AccessibleMoveOption[] {
  if (!fen) {
    return [];
  }

  try {
    return new Chess(fen).moves({ verbose: true }).map((move) => {
      const promotion = move.promotion as PieceSymbol | undefined;
      const uci = `${move.from}${move.to}${promotion ?? ""}`;
      return {
        from: move.from,
        label: `${move.san}, ${move.from} to ${move.to}${promotion ? `, promote to ${PROMOTION_LABELS[promotion]}` : ""}`,
        ...(promotion ? { promotion } : {}),
        san: move.san,
        to: move.to,
        uci
      };
    }).sort(compareMoveOptions);
  } catch {
    return [];
  }
}

function compareMoveOptions(left: AccessibleMoveOption, right: AccessibleMoveOption): number {
  const squareOrder = `${left.from}${left.to}`.localeCompare(`${right.from}${right.to}`);
  if (squareOrder !== 0) {
    return squareOrder;
  }
  return promotionOrder(left.promotion) - promotionOrder(right.promotion);
}

function promotionOrder(piece: PieceSymbol | undefined): number {
  return piece ? PROMOTION_ORDER.indexOf(piece) : -1;
}
