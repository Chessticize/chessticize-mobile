function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function frameFor(detoxElement) {
  const attributes = await detoxElement.getAttributes();
  if (Array.isArray(attributes)) {
    return attributes[0].frame;
  }
  return attributes.frame;
}

async function playBoardMove(testID, move, flipped = false) {
  const board = element(by.id(testID));
  const boardFrame = await frameFor(board);
  await board.tapAtPoint(boardPoint(boardFrame, move.slice(0, 2), flipped));
  await sleep(250);
  await board.tapAtPoint(boardPoint(boardFrame, move.slice(2, 4), flipped));
}

async function startPracticeMode(mode) {
  const startButtonId = `practice-mode-${mode}-start`;
  await waitForVisibleInPracticeScroll(startButtonId);
  await tapUntilExists(startButtonId, 'session-board', 3);
}

async function selectTestPuzzleSource(source) {
  const sourceButtonId = `test-puzzle-source-${source}`;
  await waitForVisibleInPracticeScroll(sourceButtonId);
  await element(by.id(sourceButtonId)).tap();
}

async function waitForVisibleInPracticeScroll(testID) {
  await waitFor(element(by.id(testID))).toExist().withTimeout(180000);
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .whileElement(by.id('practice-main-scroll'))
    .scroll(100, 'down');
}

async function tapUntilExists(tapTestID, expectedTestID, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await element(by.id(tapTestID)).tap();
    try {
      await waitFor(element(by.id(expectedTestID))).toExist().withTimeout(15000);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await waitForVisibleInPracticeScroll(tapTestID);
        await sleep(500);
      }
    }
  }
  throw lastError;
}

async function waitForElementTextContaining(testID, expected, timeoutMs) {
  const startedAt = Date.now();
  let lastText = '';
  while (Date.now() - startedAt < timeoutMs) {
    const attributes = await element(by.id(testID)).getAttributes();
    lastText = textFromAttributes(attributes);
    if (lastText.includes(expected)) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${testID} to contain "${expected}". Last text: "${lastText}"`);
}

function textFromAttributes(attributes) {
  const first = Array.isArray(attributes) ? attributes[0] : attributes;
  return String(first?.text ?? first?.label ?? first?.value ?? '');
}

function boardPoint(frame, square, flipped = false) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  const squareSize = frame.width / 8;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return {
    x: (col + 0.5) * squareSize,
    y: (row + 0.5) * squareSize
  };
}

async function openTab(tabTestID, contentTestID) {
  await element(by.id(tabTestID)).tap();
  // Tabs share one scroll view, so the previous tab's scroll offset persists;
  // container panels are taller than the viewport, so assert on a child.
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitForVisibleInPracticeScroll(contentTestID);
}

async function failStandardSprint() {
  await selectTestPuzzleSource('familiar15');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');

  await playBoardMove('session-board', 'c2b3');
  await sleep(1100);
  await playBoardMove('session-board', 'c4b5');
  await sleep(1100);
  await playBoardMove('session-board', 'g6g5', true);

  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
}

module.exports = {
  openTab,
  sleep,
  frameFor,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  tapUntilExists,
  waitForElementTextContaining,
  textFromAttributes,
  boardPoint,
  failStandardSprint
};
