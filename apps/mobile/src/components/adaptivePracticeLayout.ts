export type AdaptiveLayoutClass =
  | "compactPortrait"
  | "compactLandscape"
  | "regularPortrait"
  | "regularLandscape";

export type PracticeSafeAreaInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type AdaptiveLayout = {
  boardSize: number;
  className: AdaptiveLayoutClass;
  contentHeight: number;
  contentWidth: number;
  isCompactLandscape: boolean;
  isLandscape: boolean;
  isLargeText: boolean;
  isRegularWidth: boolean;
  sessionPackedRowWidth: number;
  sessionRailGap: number;
  sessionRailWidth: number;
  sideNavigationExpanded: boolean;
  sideNavigationWidth: number;
  usesSideNavigation: boolean;
  usesSessionRail: boolean;
  usesWideContent: boolean;
};

export const PRACTICE_UI_PADDING = 16;

const SESSION_RAIL_GAP_MIN = 14;
const COMPACT_LANDSCAPE_RAIL_MIN = 220;
const COMPACT_LANDSCAPE_RAIL_MAX = 300;
const REGULAR_RAIL_MIN = 296;
const REGULAR_RAIL_MAX = 360;
const COMPACT_LANDSCAPE_BOARD_MAX = 430;
const PHONE_PORTRAIT_BOARD_MAX = 560;
const REGULAR_LANDSCAPE_BOARD_MAX = 640;
const REGULAR_PORTRAIT_BOARD_MAX = 860;
const REGULAR_LANDSCAPE_RESERVED_SESSION_CHROME_HEIGHT = 120;
const REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT = 240;

export function buildPracticeAdaptiveLayout({
  fontScale,
  height,
  insets,
  width
}: {
  fontScale: number;
  height: number;
  insets: PracticeSafeAreaInsets;
  width: number;
}): AdaptiveLayout {
  const viewportWidth = Math.max(0, width - insets.left - insets.right);
  const contentHeight = Math.max(0, height - insets.top - insets.bottom);
  const isLandscape = viewportWidth > contentHeight;
  const isLargeText = fontScale >= 1.5;
  const isRegularWidth = viewportWidth >= 768 && contentHeight >= 600;
  const isCompactLandscape = isLandscape && !isRegularWidth;
  const className: AdaptiveLayoutClass = isRegularWidth
    ? isLandscape ? "regularLandscape" : "regularPortrait"
    : isLandscape ? "compactLandscape" : "compactPortrait";
  const usesSideNavigation = isCompactLandscape || isRegularWidth;
  const sideNavigationExpanded = usesSideNavigation && viewportWidth >= 960 && !isLargeText;
  const sideNavigationWidth = isRegularWidth
    ? sideNavigationExpanded ? 168 : 76
    : 64;
  const contentWidth = Math.max(
    0,
    viewportWidth - (usesSideNavigation ? sideNavigationWidth : 0)
  );
  const sessionContentWidth = viewportWidth;
  const usesWideContent = contentWidth >= 860 && !isLargeText;
  const usesSessionRail = isCompactLandscape || (isRegularWidth && isLandscape);
  const sessionRailWidth = isRegularWidth
    ? Math.min(REGULAR_RAIL_MAX, Math.max(REGULAR_RAIL_MIN, Math.floor(sessionContentWidth * 0.3)))
    : Math.min(COMPACT_LANDSCAPE_RAIL_MAX, Math.max(COMPACT_LANDSCAPE_RAIL_MIN, Math.floor(sessionContentWidth * 0.34)));
  const sessionBoardSlotWidth = Math.max(
    0,
    sessionContentWidth - PRACTICE_UI_PADDING * 2 - sessionRailWidth - SESSION_RAIL_GAP_MIN
  );
  const sessionBoardSlotHeight = Math.max(
    0,
    contentHeight - (isRegularWidth && isLandscape
      ? REGULAR_LANDSCAPE_RESERVED_SESSION_CHROME_HEIGHT
      : PRACTICE_UI_PADDING * 2)
  );
  const portraitBoardSlotWidth = Math.max(0, sessionContentWidth - PRACTICE_UI_PADDING * 2);
  const regularPortraitReservedControlsHeight = REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT +
    (isLargeText ? Math.min(180, Math.round((fontScale - 1) * 120)) : 0);
  const portraitBoardSlotHeight = isRegularWidth && !isLandscape
    ? Math.max(
        0,
        contentHeight - PRACTICE_UI_PADDING * 2 - regularPortraitReservedControlsHeight
      )
    : portraitBoardSlotWidth;
  const boardMax = isRegularWidth
    ? isLandscape ? REGULAR_LANDSCAPE_BOARD_MAX : REGULAR_PORTRAIT_BOARD_MAX
    : isCompactLandscape ? COMPACT_LANDSCAPE_BOARD_MAX : PHONE_PORTRAIT_BOARD_MAX;
  const boardSlot = usesSessionRail
    ? Math.min(sessionBoardSlotWidth, sessionBoardSlotHeight)
    : Math.min(portraitBoardSlotWidth, portraitBoardSlotHeight);
  const boardSize = Math.floor(Math.max(0, Math.min(boardSlot, boardMax)));
  const maximumSessionRailGap = Math.max(
    0,
    sessionContentWidth - PRACTICE_UI_PADDING * 2 - boardSize - sessionRailWidth
  );
  const balancedSessionRailGap = Math.floor(
    (width - boardSize - sessionRailWidth) / 3
  );
  const sessionRailGap = Math.min(
    maximumSessionRailGap,
    Math.max(SESSION_RAIL_GAP_MIN, balancedSessionRailGap)
  );

  return {
    boardSize,
    className,
    contentHeight,
    contentWidth,
    isCompactLandscape,
    isLandscape,
    isLargeText,
    isRegularWidth,
    sessionPackedRowWidth: boardSize + sessionRailWidth + sessionRailGap,
    sessionRailGap,
    sessionRailWidth,
    sideNavigationExpanded,
    sideNavigationWidth,
    usesSideNavigation,
    usesSessionRail,
    usesWideContent
  };
}
