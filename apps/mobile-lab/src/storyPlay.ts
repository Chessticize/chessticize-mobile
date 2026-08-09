import { userEvent, waitFor, within } from "storybook/test";

export async function clickTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByTestId(testID, {}, { timeout: 4_000 }));
}

export async function waitForTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByTestId(testID, {}, { timeout: 4_000 });
}

export async function centerTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const element = await page.findByTestId(testID, {}, { timeout: 4_000 });
  element.scrollIntoView({ block: "center", inline: "nearest" });
}

export async function waitForEnabledTestId(
  canvasElement: HTMLElement,
  testID: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => {
    const element = page.getByTestId(testID);
    if (element.getAttribute("aria-disabled") === "true" || element.hasAttribute("disabled")) {
      throw new Error(`${testID} must be enabled`);
    }
  }, { timeout: 4_000 });
}

export async function waitForText(canvasElement: HTMLElement, text: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByText(text, {}, { timeout: 4_000 });
}

export async function expectTestIdText(
  canvasElement: HTMLElement,
  testID: string,
  expectedText: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const element = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    if (element.textContent?.trim() !== expectedText) {
      throw new Error(`Expected ${testID} to render "${expectedText}"`);
    }
  });
}

export async function expectTestIdHorizontalCentersAligned(
  canvasElement: HTMLElement,
  firstTestID: string,
  secondTestID: string,
  tolerance = 0.5
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const first = await page.findByTestId(firstTestID, {}, { timeout: 4_000 });
  const second = await page.findByTestId(secondTestID, {}, { timeout: 4_000 });
  await waitFor(() => {
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    const offset = secondRect.left + secondRect.width / 2
      - (firstRect.left + firstRect.width / 2);
    if (Math.abs(offset) > tolerance) {
      throw new Error(
        `Expected ${firstTestID} and ${secondTestID} centers within ${tolerance}px; offset ${offset.toFixed(2)}px`
      );
    }
  });
}

export async function expectTestIdVerticalCentersAligned(
  canvasElement: HTMLElement,
  firstTestID: string,
  secondTestID: string,
  tolerance = 0.5
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const first = await page.findByTestId(firstTestID, {}, { timeout: 4_000 });
  const second = await page.findByTestId(secondTestID, {}, { timeout: 4_000 });
  await waitFor(() => {
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    const offset = secondRect.top + secondRect.height / 2
      - (firstRect.top + firstRect.height / 2);
    if (Math.abs(offset) > tolerance) {
      throw new Error(
        `Expected ${firstTestID} and ${secondTestID} vertical centers within ${tolerance}px; offset ${offset.toFixed(2)}px`
      );
    }
  });
}

export async function expectTestIdHeight(
  canvasElement: HTMLElement,
  testID: string,
  expectedHeight: number,
  tolerance = 0.5
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const element = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    const actualHeight = element.getBoundingClientRect().height;
    if (Math.abs(actualHeight - expectedHeight) > tolerance) {
      throw new Error(
        `Expected ${testID} height within ${tolerance}px of ${expectedHeight}px; received ${actualHeight.toFixed(2)}px`
      );
    }
  });
}

export async function replaceTextTestId(
  canvasElement: HTMLElement,
  testID: string,
  value: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const input = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

export async function waitForVisibleTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const element = await page.findByTestId(testID, {}, { timeout: 4_000 });
  if (element.getBoundingClientRect().height <= 0) {
    throw new Error(`${testID} must have a visible height`);
  }
}

export function expectTestIdAbsent(canvasElement: HTMLElement, testID: string): void {
  const page = within(canvasElement.ownerDocument.body);
  if (page.queryByTestId(testID)) {
    throw new Error(`${testID} must not be rendered in the production-like lab`);
  }
}

export async function dragTestId(
  canvasElement: HTMLElement,
  sourceTestID: string,
  targetTestID: string,
  options: {
    onPickup?: () => Promise<void> | void;
    onPreview?: () => Promise<void> | void;
    pointerType?: "mouse" | "touch";
    targetVerticalFraction?: number;
  } = {}
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const source = await page.findByTestId(sourceTestID, {}, { timeout: 4_000 });
  const target = await page.findByTestId(targetTestID, {}, { timeout: 4_000 });
  const PointerEventConstructor = canvasElement.ownerDocument.defaultView?.PointerEvent;
  if (!PointerEventConstructor) {
    throw new Error("This browser does not expose the Pointer Events required to test reordering");
  }
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const pointerId = 1;
  const pointerType = options.pointerType ?? "mouse";
  const targetVerticalFraction = options.targetVerticalFraction ?? 0.5;
  const dispatchPointerEvent = (
    element: HTMLElement,
    type: string,
    clientY: number,
    buttons: number
  ): void => {
    element.dispatchEvent(new PointerEventConstructor(type, {
      bubbles: true,
      buttons,
      cancelable: true,
      clientX: sourceRect.left + sourceRect.width / 2,
      clientY,
      pointerId,
      pointerType
    }));
  };

  dispatchPointerEvent(source, "pointerdown", sourceRect.top + sourceRect.height / 2, 1);
  if (pointerType === "touch") {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await options.onPickup?.();
  const targetClientY = targetRect.top + targetRect.height * targetVerticalFraction;
  dispatchPointerEvent(source, "pointermove", targetClientY, 1);
  await options.onPreview?.();
  dispatchPointerEvent(source, "pointerup", targetClientY, 0);
}

export async function expectTestIdsInOrder(
  canvasElement: HTMLElement,
  testIDs: readonly string[]
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => {
    const elements = testIDs.map((testID) => page.getByTestId(testID));
    for (let index = 0; index < elements.length - 1; index += 1) {
      const current = elements[index];
      const next = elements[index + 1];
      if (!current || !next || (current.compareDocumentPosition(next) & 4) === 0) {
        throw new Error(`Expected ${testIDs.join(", ")} in DOM order`);
      }
    }
  });
}

export async function expectReorderAnimation(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (!canvasElement.ownerDocument.body.querySelector('[data-reorder-animation="moving"]')) {
      throw new Error("Expected the surrounding Run cards to animate into their new positions");
    }
  });
}

export async function expectRunCardPickedUp(
  canvasElement: HTMLElement,
  testID: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    if (card.getAttribute("aria-grabbed") !== "true") {
      throw new Error(`Expected ${testID} to expose its grabbed state`);
    }
    if (card.dataset.dragState !== "picked-up") {
      throw new Error(`Expected ${testID} to expose its picked-up visual state`);
    }
    if (card.dataset.pickupHaptic !== "medium") {
      throw new Error(`Expected ${testID} to request medium pickup haptics`);
    }
    if (!card.style.transform.includes("translate3d")) {
      throw new Error(`Expected ${testID} to expose its lifted drag transform`);
    }
    if (!card.style.transform.includes("translate3d(10px")) {
      throw new Error(`Expected ${testID} to move slightly right when picked up`);
    }
    if (!card.style.transform.includes("scale(1.015)")) {
      throw new Error(`Expected ${testID} to scale slightly when picked up`);
    }
  });
}

export async function expectRunCardInsets(
  canvasElement: HTMLElement,
  testID: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  const view = canvasElement.ownerDocument.defaultView;
  if (!view) {
    throw new Error("Expected a browser window for Run card layout verification");
  }
  await waitFor(() => {
    const style = view.getComputedStyle(card);
    if (style.paddingLeft !== "12px" || style.paddingRight !== "12px") {
      throw new Error(`Expected ${testID} to preserve 12px horizontal content insets`);
    }
    if (style.paddingTop !== "10px" || style.paddingBottom !== "10px") {
      throw new Error(`Expected ${testID} to preserve 10px edit-mode vertical insets`);
    }
  });
}

export async function expectRunInsertionTarget(
  canvasElement: HTMLElement,
  testID: string,
  position: "after" | "before"
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    if (card.dataset.dropPosition !== position) {
      throw new Error(`Expected ${testID} to expose a ${position} insertion target`);
    }
    const insertionOutline = canvasElement.ownerDocument.body.querySelector<HTMLElement>(
      `[data-run-insertion-outline="${position}"][data-run-insertion-target="${testID}"]`
    );
    if (!insertionOutline) {
      throw new Error(`Expected ${testID} to render a visible ${position} insertion outline`);
    }
    const style = canvasElement.ownerDocument.defaultView?.getComputedStyle(insertionOutline);
    if (
      style?.borderStyle !== "dashed"
      || style.borderWidth !== "2px"
      || style.borderColor !== "rgb(37, 99, 235)"
    ) {
      throw new Error(`Expected the ${position} insertion slot to use a blue dashed outline`);
    }
    const outlineRect = insertionOutline.getBoundingClientRect();
    const targetRect = card.getBoundingClientRect();
    if (
      Math.abs(outlineRect.width - targetRect.width) > 2
      || Math.abs(outlineRect.height - targetRect.height) > 2
    ) {
      throw new Error(`Expected the ${position} insertion outline to match the card slot size`);
    }
    const pickedUpCard = canvasElement.ownerDocument.body.querySelector<HTMLElement>(
      '[data-drag-state="picked-up"]'
    );
    if (!pickedUpCard) {
      throw new Error("Expected a picked-up card while checking the insertion outline");
    }
    const targetZIndex = Number(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(card).zIndex
    );
    const outlineZIndex = Number(style.zIndex);
    const pickedUpZIndex = Number(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(pickedUpCard).zIndex
    );
    if (!(outlineZIndex > targetZIndex && outlineZIndex < pickedUpZIndex)) {
      throw new Error(`Expected the ${position} insertion outline below the picked-up card`);
    }
  });
}

export async function expectRunPreviewShift(
  canvasElement: HTMLElement,
  testID: string,
  direction: "down" | "up"
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    const offset = Number(card.dataset.dropPreviewOffset ?? 0);
    if ((direction === "up" && offset >= 0) || (direction === "down" && offset <= 0)) {
      throw new Error(`Expected ${testID} to preview-shift ${direction}`);
    }
    if (!card.style.transform.includes(`translate3d(0px, ${offset}px, 0px)`)
      && !card.style.transform.includes(`translate3d(0, ${offset}px, 0)`)) {
      throw new Error(`Expected ${testID} to expose its ${direction} preview transform`);
    }
  });
}

export async function expectPointerDrivenRunDrag(
  canvasElement: HTMLElement,
  testID: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    if (card.dataset.dragMechanism !== "pointer") {
      throw new Error(`Expected ${testID} to use pointer-driven dragging`);
    }
    if (card.dataset.browserDragGhost !== "suppressed" || card.draggable) {
      throw new Error(`Expected ${testID} to suppress the browser-native drag ghost`);
    }
    if (!card.style.transform.includes("scale(1.015)")) {
      throw new Error(`Expected ${testID} to keep the full-size card lifted under the pointer`);
    }
  });
}

export async function expectRunTouchSelectionSuppressed(
  canvasElement: HTMLElement,
  testID: string
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const card = await page.findByTestId(testID, {}, { timeout: 4_000 });
  await waitFor(() => {
    if (card.style.userSelect !== "none") {
      throw new Error(`Expected ${testID} to suppress mobile text selection`);
    }
    if (card.style.touchAction !== "pan-y") {
      throw new Error(`Expected ${testID} to preserve vertical scrolling before pickup`);
    }
  });
}

export async function openPracticeSession(canvasElement: HTMLElement): Promise<void> {
  await clickTestId(canvasElement, "practice-mode-standard");
  await clickTestId(canvasElement, "practice-start-button");
  await waitForTestId(canvasElement, "active-session-shell");
}

export async function openReviewQueue(canvasElement: HTMLElement): Promise<void> {
  await clickTestId(canvasElement, "review-tab");
  await waitForTestId(canvasElement, "review-panel");
}

export async function openHistory(canvasElement: HTMLElement): Promise<void> {
  await clickTestId(canvasElement, "history-tab");
  await waitForTestId(canvasElement, "history-panel");
}

export async function openSettings(canvasElement: HTMLElement): Promise<void> {
  await clickTestId(canvasElement, "settings-tab");
  await waitForTestId(canvasElement, "settings-panel");
}
