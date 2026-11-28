import React from "react";
import {
  classifyMaiaTimeControl,
  type MaiaGameState,
  type MaiaRatingRecord,
  type MaiaSetupPreferences
} from "../../../../../packages/core/src/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { Badge, ListRow, Section } from "../ui/index.tsx";
import { formatMaiaTimeControlDisplay, maiaTimeClassLabel } from "./maiaPlayPresentation.ts";

export interface MaiaPlayHomeCardProps {
  activeGame?: MaiaGameState | null;
  preferences: MaiaSetupPreferences;
  rating: MaiaRatingRecord;
  onOpen: () => void;
}

export function MaiaPlayHomeCard({
  activeGame,
  preferences,
  rating,
  onOpen
}: MaiaPlayHomeCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const hasResumable = activeGame != null && activeGame.status === "playing";
  const timeClass = hasResumable
    ? activeGame.timeClass
    : classifyMaiaTimeControl(preferences.timeControl);
  const tcLabel = formatMaiaTimeControlDisplay(
    hasResumable ? activeGame.timeControl : preferences.timeControl,
    t
  );
  const classLabel = maiaTimeClassLabel(timeClass, t);
  const subtitle = hasResumable
    ? `${classLabel} ${tcLabel} · Maia ${activeGame.maiaRating}`
    : `${classLabel} ${tcLabel} · ${rating.rating}`;

  return (
    <Section rows>
      <ListRow
        accessibilityHint={t("maiaPlay.homeCardHint")}
        accessibilityLabel={t("maiaPlay.homeCardA11y")}
        icon="tabGames"
        subtitle={subtitle}
        testID="maia-play-home-card"
        title={t("maiaPlay.title")}
        trailing={
          hasResumable ? (
            <Badge label={t("maiaPlay.action.resume")} tone="accent" />
          ) : undefined
        }
        onPress={onOpen}
      />
    </Section>
  );
}
