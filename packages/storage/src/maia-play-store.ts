import type {
  MaiaGameState,
  MaiaRatedGameRecord,
  MaiaRatingAnchorRecord,
  MaiaRatingRecord,
  MaiaSetupPreferences,
  MaiaTimeClass
} from "../../core/src/index.ts";

export interface MaiaPlayStore {
  getMaiaRating(timeClass: MaiaTimeClass): MaiaRatingRecord | undefined;
  listMaiaRatings(): MaiaRatingRecord[];
  saveMaiaRating(record: MaiaRatingRecord): void;
  listMaiaRatedGames(timeClass?: MaiaTimeClass): MaiaRatedGameRecord[];
  upsertMaiaRatedGame(record: MaiaRatedGameRecord): void;
  getMaiaRatingAnchor(timeClass: MaiaTimeClass): MaiaRatingAnchorRecord | undefined;
  listMaiaRatingAnchors(): MaiaRatingAnchorRecord[];
  saveMaiaRatingAnchor(anchor: MaiaRatingAnchorRecord): void;
  getMaiaSetupPreferences(): MaiaSetupPreferences;
  saveMaiaSetupPreferences(preferences: MaiaSetupPreferences): void;
  getActiveMaiaGame(): MaiaGameState | undefined;
  saveActiveMaiaGame(state: MaiaGameState): void;
  clearActiveMaiaGame(): void;
}
