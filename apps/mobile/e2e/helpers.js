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
  const modeCardId = `practice-mode-${mode}`;
  await waitForVisibleInPracticeScroll(modeCardId);
  await tapModeStartUntilExists(modeCardId, 'session-board', 3);
}

async function launchWithDisabledSynchronization(options = {}) {
  await device.launchApp({
    ...options,
    launchArgs: {
      DTXDisableMainRunLoopSync: 'YES',
      detoxEnableSynchronization: false,
      ...(options.launchArgs ?? {})
    }
  });
  await device.disableSynchronization();
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

async function tapModeStartUntilExists(modeCardId, expectedTestID, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const modeCard = element(by.id(modeCardId));
    const cardFrame = await frameFor(modeCard);
    await modeCard.tapAtPoint({
      x: Math.max(cardFrame.width - 26, 1),
      y: Math.max(cardFrame.height / 2, 1)
    });
    try {
      await waitFor(element(by.id(expectedTestID))).toExist().withTimeout(15000);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await waitForVisibleInPracticeScroll(modeCardId);
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

async function waitForMistakeCount(count, timeoutMs = 30000) {
  await waitFor(element(by.label(`Mistakes ${count} of 3`)).atIndex(0)).toExist().withTimeout(timeoutMs);
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
  await waitFor(element(by.id(tabTestID))).toExist().withTimeout(180000);
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
  await waitForMistakeCount(1);
  await sleep(1600);
  await playBoardMove('session-board', 'c4b5');
  await waitForMistakeCount(2);
  await sleep(1600);
  await playBoardMove('session-board', 'g6g5', true);

  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(30000);
}

module.exports = {
  openTab,
  launchWithDisabledSynchronization,
  sleep,
  frameFor,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  tapUntilExists,
  tapModeStartUntilExists,
  waitForElementTextContaining,
  textFromAttributes,
  boardPoint,
  failStandardSprint
};
