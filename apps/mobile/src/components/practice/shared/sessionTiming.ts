const FEEDBACK_SNAPSHOT_MS = 800;

// Brief pause so the correct-move feedback registers before the opponent
// reply animates. Kept short — the reply window delays the user's next move.
const USER_FEEDBACK_BEFORE_AUTO_MS = 120;

const ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS = 220;

// Let the animated undo and the What if cue register before the tempting move
// appears. The reply clock still begins only after the new position is ready.
const ARROW_DUEL_REPLY_PREPARATION_MS = 1_500;

const ARROW_DUEL_UNDO_ANIMATION_MS = 500;

// Shared by the practice and review boards so they animate at the same speed.
const BOARD_MOVE_ANIMATION_MS = 200;
