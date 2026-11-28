import { Chess } from "chess.js";

export interface OpeningBookMove {
  uci: string;
  weight: number;
}

/**
 * Compact human opening book covering plies 0–10 so Maia-2 (which was trained
 * on Lichess games starting at ply 11+) always enters realistic human positions
 * instead of shuffling knights in out-of-distribution opening states.
 *
 * Lines are defined in SAN and compiled lazily into a position-keyed UCI table
 * keyed by the first 4 FEN fields (`placement turn castling ep`).
 */
const OPENING_LINES: ReadonlyArray<{ weight: number; moves: readonly string[] }> = [
  // === 1. e4 e5 Open Games ===
  // Italian Game: Giuoco Piano / Two Knights / Giuoco Pianissimo
  { weight: 14, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"] },
  { weight: 12, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "Nc3", "d6"] },
  { weight: 10, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d3", "d6"] },
  { weight: 12, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5", "Nc3", "d6"] },
  { weight: 8, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Na5"] },
  { weight: 6, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Be7", "d4", "d6", "Nc3", "Nf6"] },
  // Ruy Lopez
  { weight: 12, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"] },
  { weight: 8, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Nxe4", "d4", "Be7"] },
  { weight: 6, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Bc5", "c3", "Nf6", "O-O", "O-O"] },
  // Scotch Game & Four Knights
  { weight: 10, moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Nf6", "Nc3", "Bb4"] },
  { weight: 8, moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Bc5", "Be3", "Qf6"] },
  { weight: 9, moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bb5", "Bb4", "O-O", "O-O"] },
  { weight: 7, moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bc4", "Bc5", "d3", "d6"] },
  // Petrov & Philidor
  { weight: 8, moves: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "d6", "Nf3", "Nxe4", "d4", "d5"] },
  { weight: 6, moves: ["e4", "e5", "Nf3", "Nf6", "Nc3", "Nc6", "Bb5", "Bb4", "O-O", "O-O"] },
  { weight: 6, moves: ["e4", "e5", "Nf3", "d6", "d4", "exd4", "Nxd4", "Nf6", "Nc3", "Be7"] },
  // Vienna & Bishop's Opening
  { weight: 7, moves: ["e4", "e5", "Nc3", "Nf6", "Bc4", "Nc6", "d3", "Bc5", "Nf3", "d6"] },
  { weight: 5, moves: ["e4", "e5", "Nc3", "Nc6", "Bc4", "Nf6", "d3", "Bc5", "Nf3", "d6"] },
  { weight: 5, moves: ["e4", "e5", "Bc4", "Nf6", "d3", "Nc6", "Nf3", "Bc5", "O-O", "d6"] },

  // === 1. e4 c5 Sicilian Defense ===
  { weight: 12, moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"] },
  { weight: 10, moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"] },
  { weight: 10, moves: ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "e5"] },
  { weight: 9, moves: ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "e6", "Nc3", "Qc7"] },
  { weight: 9, moves: ["e4", "c5", "Nf3", "e6", "d4", "cxd4", "Nxd4", "a6", "Nc3", "Qc7"] },
  { weight: 8, moves: ["e4", "c5", "c3", "Nf6", "e5", "Nd5", "d4", "cxd4", "Nf3", "Nc6"] },
  { weight: 7, moves: ["e4", "c5", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7", "d3", "d6"] },
  { weight: 6, moves: ["e4", "c5", "Bc4", "e6", "Nc3", "Nc6", "Nf3", "Nf6", "d3", "d5"] },

  // === 1. e4 e6 French Defense ===
  { weight: 10, moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "e5", "Nfd7", "f4", "c5"] },
  { weight: 9, moves: ["e4", "e6", "d4", "d5", "e5", "c5", "c3", "Nc6", "Nf3", "Qb6"] },
  { weight: 8, moves: ["e4", "e6", "d4", "d5", "exd5", "exd5", "Nf3", "Nf6", "Bd3", "Bd6"] },
  { weight: 7, moves: ["e4", "e6", "d4", "d5", "Nd2", "Nf6", "e5", "Nfd7", "Bd3", "c5"] },

  // === 1. e4 c6 Caro-Kann Defense ===
  { weight: 10, moves: ["e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3", "e6", "Be2", "c5"] },
  { weight: 9, moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"] },
  { weight: 7, moves: ["e4", "c6", "d4", "d5", "exd5", "cxd5", "Bd3", "Nc6", "c3", "Nf6"] },
  { weight: 6, moves: ["e4", "c6", "Nf3", "d5", "Nc3", "Bg4", "h3", "Bxf3", "Qxf3", "e6"] },

  // === 1. e4 d5 Scandinavian & 1. e4 d6 Pirc ===
  { weight: 8, moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "Bf5"] },
  { weight: 5, moves: ["e4", "d5", "exd5", "Nf6", "d4", "Nxd5", "Nf3", "Bg4", "Be2", "e6"] },
  { weight: 5, moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be2", "O-O"] },

  // === 1. d4 d5 Queen's Gambit / London / Slav ===
  { weight: 12, moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"] },
  { weight: 10, moves: ["d4", "d5", "c4", "e6", "Nf3", "Nf6", "Nc3", "Be7", "Bf4", "O-O"] },
  { weight: 9, moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4", "Bf5"] },
  { weight: 8, moves: ["d4", "d5", "c4", "dxc4", "Nf3", "Nf6", "e3", "e6", "Bxc4", "c5"] },
  { weight: 12, moves: ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "c5", "c3", "Nc6"] },
  { weight: 9, moves: ["d4", "d5", "Bf4", "Bf5", "e3", "e6", "Nf3", "Nf6", "Bd3", "Bxd3"] },
  { weight: 7, moves: ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3", "c5", "c3", "Nc6"] },

  // === 1. d4 Nf6 Indian Defenses ===
  { weight: 11, moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"] },
  { weight: 10, moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "e3", "O-O", "Bd3", "d5"] },
  { weight: 9, moves: ["d4", "Nf6", "c4", "e6", "Nf3", "d5", "Nc3", "Be7", "Bf4", "O-O"] },
  { weight: 8, moves: ["d4", "Nf6", "Bf4", "d5", "e3", "c5", "c3", "Nc6", "Nd2", "e6"] },
  { weight: 7, moves: ["d4", "Nf6", "Nf3", "g6", "Bf4", "Bg7", "e3", "O-O", "Be2", "d6"] },
  { weight: 6, moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5", "cxd5", "Nxd5", "e4", "Nxc3"] },
  { weight: 6, moves: ["d4", "e6", "c4", "Nf6", "Nc3", "Bb4", "e3", "O-O", "Nf3", "d5"] },

  // === 1. Nf3 Reti & 1. c4 English ===
  { weight: 9, moves: ["Nf3", "d5", "d4", "Nf6", "c4", "e6", "Nc3", "Be7", "Bg5", "O-O"] },
  { weight: 7, moves: ["Nf3", "Nf6", "c4", "g6", "Nc3", "Bg7", "d4", "O-O", "e4", "d6"] },
  { weight: 7, moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3", "O-O"] },
  { weight: 8, moves: ["c4", "e5", "Nc3", "Nf6", "Nf3", "Nc6", "g3", "Bb4", "Bg2", "O-O"] },
  { weight: 7, moves: ["c4", "Nf6", "Nc3", "e6", "Nf3", "d5", "d4", "Be7", "Bg5", "O-O"] },
  { weight: 6, moves: ["c4", "c5", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7", "Nf3", "Nf6"] }
];

let cachedBook: Map<string, OpeningBookMove[]> | null = null;

export function openingPositionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function getOpeningBook(): Map<string, OpeningBookMove[]> {
  if (cachedBook) {
    return cachedBook;
  }
  const byPos = new Map<string, Map<string, number>>();
  for (const line of OPENING_LINES) {
    const chess = new Chess();
    for (const san of line.moves) {
      const key = openingPositionKey(chess.fen());
      const played = chess.move(san);
      if (!played) {
        break;
      }
      const uci = `${played.from}${played.to}${played.promotion ?? ""}`.toLowerCase();
      let movesMap = byPos.get(key);
      if (!movesMap) {
        movesMap = new Map<string, number>();
        byPos.set(key, movesMap);
      }
      movesMap.set(uci, (movesMap.get(uci) ?? 0) + line.weight);
    }
  }

  const out = new Map<string, OpeningBookMove[]>();
  for (const [key, movesMap] of byPos) {
    const list: OpeningBookMove[] = [...movesMap.entries()]
      .map(([uci, weight]) => ({ uci, weight }))
      .sort((a, b) => b.weight - a.weight || a.uci.localeCompare(b.uci));
    out.set(key, list);
  }
  cachedBook = out;
  return out;
}

/**
 * Look up human opening book moves for `fen`. Returns `null` if out of book.
 */
export function lookupMaiaOpeningBook(fen: string): readonly OpeningBookMove[] | null {
  const entries = getOpeningBook().get(openingPositionKey(fen));
  return entries && entries.length > 0 ? entries : null;
}
