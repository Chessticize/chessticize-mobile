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
  promptFrameHeight: number;
  // Regular landscape sessions centre the board and rail row, and the rail's
  // content block, in the available height. Compact layouts keep top alignment.
  sessionCentersRow: boolean;
  sessionPackedRowWidth: number;
  sessionRailGap: number;
  sessionRailWidth: number;
  usesHomeColumns: boolean;
  usesSessionRail: boolean;
  usesWideContent: boolean;
};

export const PRACTICE_UI_PADDING = 16;
export const PRACTICE_PROMPT_BASE_HEIGHT = 96;

const SESSION_RAIL_GAP_MIN = 14;
const PRACTICE_PROMPT_NARROW_WIDTH = 300;
const PRACTICE_PROMPT_NARROW_EXTRA_HEIGHT = 16;
const PRACTICE_PROMPT_FONT_SCALE_EXTRA_HEIGHT = 48;
const COMPACT_LANDSCAPE_RAIL_MIN = 220;
const COMPACT_LANDSCAPE_RAIL_MAX = 300;
const REGULAR_RAIL_MIN = 296;
const REGULAR_RAIL_MAX = 360;
const COMPACT_LANDSCAPE_BOARD_MAX = 430;
const PHONE_PORTRAIT_BOARD_MAX = 560;
const REGULAR_LANDSCAPE_BOARD_MAX = 640;
const REGULAR_PORTRAIT_BOARD_MAX = 860;
// Compact portrait locks the outer scroll while the board accepts input, so
// this budget must also keep the post-answer Unclear action inside the viewport.
const COMPACT_PORTRAIT_RESERVED_CONTROLS_HEIGHT = 332;
const REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT = 240;
const HOME_COLUMNS_MIN_CONTENT_WIDTH = 650;

// Top-level navigation chrome is drawn by the native tab host (#612). Its space
// (the bottom glass bar, the iPhone Duo column, the iPad top bar, the Android
// rail) arrives as part of `insets` for tab content, so content width is
// simply the inset viewport.
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
  const contentWidth = viewportWidth;
  const sessionContentWidth = viewportWidth;
  const usesWideContent = contentWidth >= 860 && !isLargeText;
  const usesHomeColumns = (
    usesWideContent
      || (isLandscape && contentWidth >= HOME_COLUMNS_MIN_CONTENT_WIDTH)
  ) && !isLargeText;
  const usesSessionRail = isCompactLandscape || (isRegularWidth && isLandscape);
  const sessionRailWidth = isRegularWidth
    ? Math.min(REGULAR_RAIL_MAX, Math.max(REGULAR_RAIL_MIN, Math.floor(sessionContentWidth * 0.3)))
    : Math.min(COMPACT_LANDSCAPE_RAIL_MAX, Math.max(COMPACT_LANDSCAPE_RAIL_MIN, Math.floor(sessionContentWidth * 0.34)));
  const sessionBoardSlotWidth = Math.max(
    0,
    sessionContentWidth - PRACTICE_UI_PADDING * 2 - sessionRailWidth - SESSION_RAIL_GAP_MIN
  );
  // In rail layouts the session chrome (header, metrics, prompt, counts) sits in
  // the rail beside the board, so the board only gives up the content padding.
  const sessionBoardSlotHeight = Math.max(0, contentHeight - PRACTICE_UI_PADDING * 2);
  const portraitBoardSlotWidth = Math.max(0, sessionContentWidth - PRACTICE_UI_PADDING * 2);
  const portraitReservedControlsHeight = (
    isRegularWidth
      ? REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT
      : COMPACT_PORTRAIT_RESERVED_CONTROLS_HEIGHT
  ) +
    (isLargeText ? Math.min(180, Math.round((fontScale - 1) * 120)) : 0);
  const portraitBoardSlotHeight = !isLandscape
    ? Math.max(
      0,
      contentHeight - PRACTICE_UI_PADDING * 2 - portraitReservedControlsHeight
      )
    : portraitBoardSlotWidth;
  const boardMax = isRegularWidth
    ? isLandscape ? REGULAR_LANDSCAPE_BOARD_MAX : REGULAR_PORTRAIT_BOARD_MAX
    : isCompactLandscape ? COMPACT_LANDSCAPE_BOARD_MAX : PHONE_PORTRAIT_BOARD_MAX;
  const boardSlot = usesSessionRail
    ? Math.min(sessionBoardSlotWidth, sessionBoardSlotHeight)
    : Math.min(portraitBoardSlotWidth, portraitBoardSlotHeight);
  const boardSize = Math.floor(Math.max(0, Math.min(boardSlot, boardMax)));
  const promptSlotWidth = usesSessionRail ? sessionRailWidth : boardSize;
  const promptNarrowExtraHeight = promptSlotWidth < PRACTICE_PROMPT_NARROW_WIDTH
    ? PRACTICE_PROMPT_NARROW_EXTRA_HEIGHT
    : 0;
  const promptFontScaleExtraHeight = Math.round(
    Math.max(0, fontScale - 1) * PRACTICE_PROMPT_FONT_SCALE_EXTRA_HEIGHT
  );
  const promptFrameHeight = PRACTICE_PROMPT_BASE_HEIGHT + Math.max(
    promptNarrowExtraHeight,
    promptFontScaleExtraHeight
  );
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
    promptFrameHeight,
    sessionCentersRow: isRegularWidth && isLandscape,
    sessionPackedRowWidth: boardSize + sessionRailWidth + sessionRailGap,
    sessionRailGap,
    sessionRailWidth,
    usesHomeColumns,
    usesSessionRail,
    usesWideContent
  };
}
