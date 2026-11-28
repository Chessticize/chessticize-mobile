import type {
  MaiaGameState,
  MaiaRatingRecord,
  MaiaSetupPreferences,
  MaiaTimeClass
} from "../../core/src/index.ts";

export interface MaiaPlayStore {
  getMaiaRating(timeClass: MaiaTimeClass): MaiaRatingRecord | undefined;
  listMaiaRatings(): MaiaRatingRecord[];
  saveMaiaRating(record: MaiaRatingRecord): void;
  getMaiaSetupPreferences(): MaiaSetupPreferences;
  saveMaiaSetupPreferences(preferences: MaiaSetupPreferences): void;
  getActiveMaiaGame(): MaiaGameState | undefined;
  saveActiveMaiaGame(state: MaiaGameState): void;
  clearActiveMaiaGame(): void;
}
