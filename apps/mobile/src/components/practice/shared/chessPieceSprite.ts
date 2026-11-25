import type { ImageSourcePropType } from "react-native";
import type { ChessPieceSetId } from "../../../theme/index.ts";

export type ChessPieceSetOption = {
  id: ChessPieceSetId;
  label: string;
  source: ImageSourcePropType;
};

export const CHESS_PIECE_SPRITE = require("../../../assets/chess-pieces-sprite.png") as ImageSourcePropType;

export const CHESS_PIECE_SET_OPTIONS: readonly ChessPieceSetOption[] = [
  {
    id: "default",
    label: "Default",
    source: CHESS_PIECE_SPRITE
  },
  {
    id: "cburnett",
    label: "Classic",
    source: require("../../../assets/pieces/cburnett.png") as ImageSourcePropType
  },
  {
    id: "merida",
    label: "Merida",
    source: require("../../../assets/pieces/merida.png") as ImageSourcePropType
  },
  {
    id: "chessnut",
    label: "Chessnut",
    source: require("../../../assets/pieces/chessnut.png") as ImageSourcePropType
  },
  {
    id: "spatial",
    label: "Spatial",
    source: require("../../../assets/pieces/spatial.png") as ImageSourcePropType
  },
  {
    id: "fantasy",
    label: "Fantasy",
    source: require("../../../assets/pieces/fantasy.png") as ImageSourcePropType
  }
];

export const CHESS_PIECE_SPRITES: Readonly<Record<ChessPieceSetId, ImageSourcePropType>> = {
  default: CHESS_PIECE_SET_OPTIONS[0]!.source,
  cburnett: CHESS_PIECE_SET_OPTIONS[1]!.source,
  merida: CHESS_PIECE_SET_OPTIONS[2]!.source,
  chessnut: CHESS_PIECE_SET_OPTIONS[3]!.source,
  spatial: CHESS_PIECE_SET_OPTIONS[4]!.source,
  fantasy: CHESS_PIECE_SET_OPTIONS[5]!.source
};

export function chessPieceSpriteFor(pieceSet: ChessPieceSetId): ImageSourcePropType {
  return CHESS_PIECE_SPRITES[pieceSet] ?? CHESS_PIECE_SPRITE;
}
