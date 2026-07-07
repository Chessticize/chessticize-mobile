const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

describe("react-native-chessboard gesture patch", () => {
  it("rejects opponent-piece drags before the piece can visibly move", () => {
    const packageRoot = dirname(require.resolve("react-native-chessboard/package.json"));
    const sources = [
      resolve(packageRoot, "src/hooks/use-board-gesture.ts"),
      resolve(packageRoot, "lib/module/hooks/use-board-gesture.js"),
      resolve(packageRoot, "lib/commonjs/hooks/use-board-gesture.js")
    ];

    for (const sourcePath of sources) {
      expectGestureSourceRejectsOpponentPiecesBeforeRaise(readFileSync(sourcePath, "utf8"), sourcePath);
    }
  });

  it("keeps the opponent-piece drag guard in the durable package patch", () => {
    const patch = readFileSync(
      resolve(__dirname, "../../../patches/react-native-chessboard@0.2.0.patch"),
      "utf8"
    );

    expect(patch).toContain("if (!piece || piece[0] !== allowedDragColor)");
    expect(patch).toContain("draggedSquare.set(null);");
  });

  it("accepts fast legal drags before validMoves has returned to the UI thread", () => {
    const packageRoot = dirname(require.resolve("react-native-chessboard/package.json"));
    const sources = [
      resolve(packageRoot, "src/hooks/use-board-gesture.ts"),
      resolve(packageRoot, "lib/module/hooks/use-board-gesture.js"),
      resolve(packageRoot, "lib/commonjs/hooks/use-board-gesture.js")
    ];

    for (const sourcePath of sources) {
      expectGestureSourceHandlesPendingValidMoves(readFileSync(sourcePath, "utf8"), sourcePath);
    }
  });

  it("keeps the fast-drag validMoves fallback in the durable package patch", () => {
    const patch = readFileSync(
      resolve(__dirname, "../../../patches/react-native-chessboard@0.2.0.patch"),
      "utf8"
    );

    expect(patch).toContain("validMoves.length === 0");
    expect(patch).toContain("handleTryMove, square, targetSquare, true");
  });

  it("accepts fast tap-tap moves before validMoves has returned to the UI thread", () => {
    const packageRoot = dirname(require.resolve("react-native-chessboard/package.json"));
    const sources = [
      resolve(packageRoot, "src/hooks/use-board-gesture.ts"),
      resolve(packageRoot, "lib/module/hooks/use-board-gesture.js"),
      resolve(packageRoot, "lib/commonjs/hooks/use-board-gesture.js")
    ];

    for (const sourcePath of sources) {
      expectGestureSourceHandlesPendingTapTarget(readFileSync(sourcePath, "utf8"), sourcePath);
    }
  });

  it("selects tapped own pieces on the UI thread before React handles valid moves", () => {
    const packageRoot = dirname(require.resolve("react-native-chessboard/package.json"));
    const sources = [
      resolve(packageRoot, "src/hooks/use-board-gesture.ts"),
      resolve(packageRoot, "lib/module/hooks/use-board-gesture.js"),
      resolve(packageRoot, "lib/commonjs/hooks/use-board-gesture.js")
    ];

    for (const sourcePath of sources) {
      expectGestureSourceSelectsTappedPiecesImmediately(readFileSync(sourcePath, "utf8"), sourcePath);
    }
  });

  it("keeps the fast tap-tap validMoves fallback in the durable package patch", () => {
    const patch = readFileSync(
      resolve(__dirname, "../../../patches/react-native-chessboard@0.2.0.patch"),
      "utf8"
    );

    expect(patch).toContain("tap-tap stays responsive");
    expect(patch).toContain("handleTryMove, selectedSquare, square, true");
    expect(patch).toContain("boardState.selectedSquare.set(square);");
  });
});

function expectGestureSourceRejectsOpponentPiecesBeforeRaise(source, sourcePath) {
  const beginIndex = source.indexOf(".onBegin");
  const beginAllowedColorIndex = source.indexOf("const allowedDragColor = draggableColor ?? turn;", beginIndex);
  const beginRejectIndex = source.indexOf("if (!piece || piece[0] !== allowedDragColor)", beginAllowedColorIndex);
  const beginClearDragIndex = source.indexOf("draggedSquare.set(null);", beginRejectIndex);
  const beginReturnIndex = source.indexOf("return;", beginClearDragIndex);
  const trackDragIndex = source.indexOf("draggedSquare.set(square);", beginIndex);

  expect(beginIndex).toBeGreaterThanOrEqual(0);
  expect(beginAllowedColorIndex).toBeGreaterThan(beginIndex);
  expect(beginRejectIndex).toBeGreaterThan(beginAllowedColorIndex);
  expect(beginClearDragIndex).toBeGreaterThan(beginRejectIndex);
  expect(beginReturnIndex).toBeGreaterThan(beginClearDragIndex);
  expect(trackDragIndex).toBeGreaterThan(beginReturnIndex);

  const startIndex = source.indexOf(".onStart", beginIndex);
  const turnIndex = source.indexOf("const turn = boardState.turn.get();", startIndex);
  const allowedColorIndex = source.indexOf("const allowedDragColor = draggableColor ?? turn;", turnIndex);
  const guardIndex = source.indexOf("const isOwnPiece = piece && piece[0] === allowedDragColor;", allowedColorIndex);
  const rejectIndex = source.indexOf("if (!isOwnPiece)", guardIndex);
  const clearDragIndex = source.indexOf("draggedSquare.set(null);", rejectIndex);
  const rejectReturnIndex = source.indexOf("return;", clearDragIndex);
  const raiseIndex = source.indexOf("squareState.zIndex.set(100);", turnIndex);

  expect(turnIndex).toBeGreaterThanOrEqual(0);
  expect(allowedColorIndex).toBeGreaterThan(turnIndex);
  expect(guardIndex).toBeGreaterThan(allowedColorIndex);
  expect(rejectIndex).toBeGreaterThan(guardIndex);
  expect(clearDragIndex).toBeGreaterThan(rejectIndex);
  expect(rejectReturnIndex).toBeGreaterThan(clearDragIndex);
  expect(raiseIndex).toBeGreaterThan(rejectReturnIndex);

  const rejectSource = source.slice(rejectIndex, rejectReturnIndex);
  expect(rejectSource).not.toContain("boardState.selectedSquare.set(null);");
  expect(rejectSource).not.toContain("boardState.validMoves.set([]);");

  const dragStartEndIndex = source.indexOf(".onUpdate", raiseIndex);
  const dragStartSource = source.slice(raiseIndex, dragStartEndIndex);
  expect(dragStartSource).not.toContain("if (isOwnPiece)");
  const depsIndex = source.lastIndexOf("draggableColor");
  const dependencyListIndex = source.lastIndexOf("handleIllegalMove");
  expect(depsIndex).toBeGreaterThan(rejectReturnIndex);
  expect(depsIndex).toBeLessThan(dependencyListIndex);
  expect(sourcePath).toBeTruthy();
}

function expectGestureSourceHandlesPendingValidMoves(source, sourcePath) {
  const beginIndex = source.indexOf(".onBegin");
  const startIndex = source.indexOf(".onStart", beginIndex);
  const earlySelectIndex = source.indexOf("handleSelectPiece, square", beginIndex);

  expect(beginIndex).toBeGreaterThanOrEqual(0);
  expect(startIndex).toBeGreaterThan(beginIndex);
  expect(earlySelectIndex).toBeGreaterThan(beginIndex);
  expect(earlySelectIndex).toBeLessThan(startIndex);

  const tryMoveIndex = source.indexOf("notifyOnInvalid");
  const pendingIndex = source.indexOf("validMoves.length === 0");
  const pendingTryIndex = source.indexOf("handleTryMove, square, targetSquare, true", pendingIndex);

  expect(tryMoveIndex).toBeGreaterThanOrEqual(0);
  expect(source).toContain("moveExecutor.tryMove(from, to).then");
  expect(pendingIndex).toBeGreaterThan(startIndex);
  expect(pendingTryIndex).toBeGreaterThan(pendingIndex);
  expect(sourcePath).toBeTruthy();
}

function expectGestureSourceHandlesPendingTapTarget(source, sourcePath) {
  const tapIndex = source.indexOf("Add tap gesture");
  const validMovesIndex = source.indexOf("const validMoves = boardState.validMoves.get();", tapIndex);
  const validTryIndex = source.indexOf("handleTryMove, selectedSquare, square", validMovesIndex);
  const switchOwnPieceIndex = source.indexOf("Tapped on another own piece", validTryIndex);
  const pendingIndex = source.indexOf("validMoves.length === 0", switchOwnPieceIndex);
  const clearSelectionIndex = source.indexOf("boardState.selectedSquare.set(null);", pendingIndex);
  const pendingTryIndex = source.indexOf("handleTryMove, selectedSquare, square, true", pendingIndex);
  const invalidTargetIndex = source.indexOf("Invalid target - deselect", pendingTryIndex);

  expect(tapIndex).toBeGreaterThanOrEqual(0);
  expect(validMovesIndex).toBeGreaterThan(tapIndex);
  expect(validTryIndex).toBeGreaterThan(validMovesIndex);
  expect(switchOwnPieceIndex).toBeGreaterThan(validTryIndex);
  expect(pendingIndex).toBeGreaterThan(switchOwnPieceIndex);
  expect(clearSelectionIndex).toBeGreaterThan(pendingIndex);
  expect(pendingTryIndex).toBeGreaterThan(clearSelectionIndex);
  expect(invalidTargetIndex).toBeGreaterThan(pendingTryIndex);
  expect(sourcePath).toBeTruthy();
}

function expectGestureSourceSelectsTappedPiecesImmediately(source, sourcePath) {
  const tapIndex = source.indexOf("Add tap gesture");

  const noSelectionIndex = source.indexOf("No piece selected", tapIndex);
  const firstOwnPieceIndex = source.indexOf("if (isOwnPiece)", noSelectionIndex);
  const firstSelectIndex = source.indexOf("boardState.selectedSquare.set(square);", firstOwnPieceIndex);
  const firstClearMovesIndex = source.indexOf("boardState.validMoves.set([]);", firstSelectIndex);
  const firstScheduleIndex = source.indexOf("handleSelectPiece, square", firstClearMovesIndex);

  expect(tapIndex).toBeGreaterThanOrEqual(0);
  expect(noSelectionIndex).toBeGreaterThan(tapIndex);
  expect(firstOwnPieceIndex).toBeGreaterThan(noSelectionIndex);
  expect(firstSelectIndex).toBeGreaterThan(firstOwnPieceIndex);
  expect(firstClearMovesIndex).toBeGreaterThan(firstSelectIndex);
  expect(firstScheduleIndex).toBeGreaterThan(firstClearMovesIndex);

  const switchOwnPieceIndex = source.indexOf("Tapped on another own piece", firstScheduleIndex);
  const switchOwnPieceGuardIndex = source.indexOf("if (isOwnPiece)", switchOwnPieceIndex);
  const switchSelectIndex = source.indexOf("boardState.selectedSquare.set(square);", switchOwnPieceGuardIndex);
  const switchClearMovesIndex = source.indexOf("boardState.validMoves.set([]);", switchSelectIndex);
  const switchScheduleIndex = source.indexOf("handleSelectPiece, square", switchClearMovesIndex);

  expect(switchOwnPieceIndex).toBeGreaterThan(firstScheduleIndex);
  expect(switchOwnPieceGuardIndex).toBeGreaterThan(switchOwnPieceIndex);
  expect(switchSelectIndex).toBeGreaterThan(switchOwnPieceGuardIndex);
  expect(switchClearMovesIndex).toBeGreaterThan(switchSelectIndex);
  expect(switchScheduleIndex).toBeGreaterThan(switchClearMovesIndex);
  expect(sourcePath).toBeTruthy();
}
