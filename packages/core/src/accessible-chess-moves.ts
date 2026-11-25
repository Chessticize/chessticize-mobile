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

export type AccessibleMoveLabelInput = {
  from: Square;
  promotion?: PieceSymbol;
  san: string;
  to: Square;
};

export type BuildAccessibleMoveOptions = {
  formatLabel?: (move: AccessibleMoveLabelInput) => string;
};

function defaultAccessibleMoveLabel(move: AccessibleMoveLabelInput): string {
  return `${move.san}, ${move.from} to ${move.to}${move.promotion ? `, promote to ${PROMOTION_LABELS[move.promotion]}` : ""}`;
}

export function buildAccessibleMoveOptions(
  fen: string | null | undefined,
  options?: BuildAccessibleMoveOptions
): AccessibleMoveOption[] {
  if (!fen) {
    return [];
  }

  const formatLabel = options?.formatLabel ?? defaultAccessibleMoveLabel;
  try {
    return new Chess(fen).moves({ verbose: true }).map((move) => {
      const promotion = move.promotion as PieceSymbol | undefined;
      const uci = `${move.from}${move.to}${promotion ?? ""}`;
      const labelInput: AccessibleMoveLabelInput = {
        from: move.from,
        ...(promotion ? { promotion } : {}),
        san: move.san,
        to: move.to
      };
      return {
        from: move.from,
        label: formatLabel(labelInput),
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
