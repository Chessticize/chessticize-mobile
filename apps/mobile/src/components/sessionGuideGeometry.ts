export type SessionGuideLayoutRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SessionGuideRailConnectorGeometry = {
  calloutTop: number;
  connectorTop: number;
  connectorWidth: number;
};

export function buildPortraitGuidePointerLeft({
  calloutWidth,
  pointerWidth = 24,
  target
}: {
  calloutWidth: number;
  pointerWidth?: number;
  target: Pick<SessionGuideLayoutRect, "width" | "x">;
}): number {
  const inset = 8;
  const targetCenter = target.x + target.width / 2;
  const desiredLeft = targetCenter - pointerWidth / 2;
  return Math.round(Math.max(
    inset,
    Math.min(calloutWidth - pointerWidth - inset, desiredLeft)
  ));
}

export function buildSessionGuideRailConnectorGeometry({
  boardSize,
  calloutHeight,
  target
}: {
  boardSize: number;
  calloutHeight: number;
  target: SessionGuideLayoutRect;
}): SessionGuideRailConnectorGeometry {
  const inset = 12;
  const calloutRight = boardSize - inset;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const maximumTop = Math.max(inset, boardSize - calloutHeight - inset);
  const calloutTop = Math.round(Math.min(
    maximumTop,
    Math.max(inset, targetCenterY - calloutHeight / 2)
  ));

  return {
    calloutTop,
    connectorTop: Math.round(targetCenterY - calloutTop),
    connectorWidth: Math.max(18, Math.round(targetCenterX - calloutRight))
  };
}

export type ArrowDuelLandscapeGuideGeometry = {
  calloutTop: number;
  connectorHeight: number;
  connectorLeft: number;
};

export function buildArrowDuelLandscapeGuideGeometry(
  boardSize: number
): ArrowDuelLandscapeGuideGeometry {
  const calloutLeft = 12;
  const calloutTop = Math.round(boardSize * 0.58);
  const candidateOriginCenterX = boardSize * (6.5 / 8);
  const candidateOriginCenterY = boardSize * (2.5 / 8);

  return {
    calloutTop,
    connectorHeight: Math.max(24, Math.round(calloutTop - candidateOriginCenterY)),
    connectorLeft: Math.round(candidateOriginCenterX - calloutLeft)
  };
}
