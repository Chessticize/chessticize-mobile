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
  // Width of the prompt, board details and feedback rows stacked with the
  // board. Compact portrait gives them the content width so a height-bound
  // board on a short phone does not squeeze their text into extra lines; the
  // rail layouts use the rail width.
  sessionColumnWidth: number;
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
// Prompt copy grows at most this much with Dynamic Type (#652), so its frame
// grows with the capped scale rather than the system scale.
export const PRACTICE_PROMPT_MAX_TEXT_SCALE = 1.25;
const COMPACT_LANDSCAPE_RAIL_MIN = 220;
const COMPACT_LANDSCAPE_RAIL_MAX = 300;
const REGULAR_RAIL_MIN = 296;
const REGULAR_RAIL_MAX = 360;
const COMPACT_LANDSCAPE_BOARD_MAX = 430;
const PHONE_PORTRAIT_BOARD_MAX = 560;
const REGULAR_LANDSCAPE_BOARD_MAX = 640;
const REGULAR_PORTRAIT_BOARD_MAX = 860;
// Compact portrait locks the outer scroll while the board accepts input, so
// everything stacked with the board must fit the viewport: the status bar,
// prompt, board details (puzzle timing and counts) and the post-answer
// feedback row. Heights measured on the live session (iPhone SE, iOS 27,
// default text size); the prompt height comes from this layout.
// - status bar: close/pause row 53 + 8 gap + metrics 36
// - board details: 3 + timing 18 + 3 + counts 46
// - feedback: the taller of the Mark as unclear row and the previous-attempt
//   notice. The rows span the content width; at 343 points (iPhone SE) they
//   are 46 and 58, and at 283 points the notice wraps to 72.5, which covers
//   the 288-point column of a 320-point phone.
export const COMPACT_PORTRAIT_SESSION_CHROME = {
  boardDetails: 70,
  feedback: 58,
  narrowColumnFeedback: 73,
  narrowColumnWidth: 340,
  stackGap: 12,
  status: 97
} as const;
const REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT = 240;
const HOME_COLUMNS_MIN_CONTENT_WIDTH = 650;

export function compactPortraitFeedbackHeight(columnWidth: number): number {
  const chrome = COMPACT_PORTRAIT_SESSION_CHROME;
  return columnWidth < chrome.narrowColumnWidth ? chrome.narrowColumnFeedback : chrome.feedback;
}

function compactPortraitSessionChromeHeight(promptHeight: number, columnWidth: number): number {
  const chrome = COMPACT_PORTRAIT_SESSION_CHROME;
  return chrome.status
    + chrome.stackGap
    + promptHeight
    + chrome.stackGap
    + chrome.boardDetails
    + chrome.stackGap
    + compactPortraitFeedbackHeight(columnWidth);
}

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
  const largeTextReservedHeight = isLargeText
    ? Math.min(180, Math.round((fontScale - 1) * 120))
    : 0;
  // The rows stacked with a compact-portrait board span the content width,
  // so the prompt's height is known before the board is sized.
  const compactPortraitColumnWidth = portraitBoardSlotWidth;
  const compactPortraitPromptHeight = PRACTICE_PROMPT_BASE_HEIGHT + (
    compactPortraitColumnWidth < PRACTICE_PROMPT_NARROW_WIDTH
      ? PRACTICE_PROMPT_NARROW_EXTRA_HEIGHT
      : 0
  );
  const portraitBoardSlotHeight = (() => {
    if (isLandscape) {
      return portraitBoardSlotWidth;
    }
    const reservedControlsHeight = isRegularWidth
      ? REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT
      : compactPortraitSessionChromeHeight(compactPortraitPromptHeight, compactPortraitColumnWidth);
    return Math.max(
      0,
      contentHeight - PRACTICE_UI_PADDING * 2 - reservedControlsHeight - largeTextReservedHeight
    );
  })();
  const boardMax = isRegularWidth
    ? isLandscape ? REGULAR_LANDSCAPE_BOARD_MAX : REGULAR_PORTRAIT_BOARD_MAX
    : isCompactLandscape ? COMPACT_LANDSCAPE_BOARD_MAX : PHONE_PORTRAIT_BOARD_MAX;
  const boardSlot = usesSessionRail
    ? Math.min(sessionBoardSlotWidth, sessionBoardSlotHeight)
    : Math.min(portraitBoardSlotWidth, portraitBoardSlotHeight);
  const boardSize = Math.floor(Math.max(0, Math.min(boardSlot, boardMax)));
  const sessionColumnWidth = usesSessionRail
    ? sessionRailWidth
    : isRegularWidth
      ? boardSize
      : compactPortraitColumnWidth;
  const promptSlotWidth = sessionColumnWidth;
  const promptNarrowExtraHeight = promptSlotWidth < PRACTICE_PROMPT_NARROW_WIDTH
    ? PRACTICE_PROMPT_NARROW_EXTRA_HEIGHT
    : 0;
  const promptFontScaleExtraHeight = Math.round(
    Math.max(0, Math.min(fontScale, PRACTICE_PROMPT_MAX_TEXT_SCALE) - 1) * PRACTICE_PROMPT_BASE_HEIGHT
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
    sessionColumnWidth,
    sessionPackedRowWidth: boardSize + sessionRailWidth + sessionRailGap,
    sessionRailGap,
    sessionRailWidth,
    usesHomeColumns,
    usesSessionRail,
    usesWideContent
  };
}
