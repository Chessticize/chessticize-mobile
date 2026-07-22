import { userEvent, waitFor, within } from "storybook/test";

export async function clickTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByTestId(testID, {}, { timeout: 4_000 }));
}

export async function waitForTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByTestId(testID, {}, { timeout: 4_000 });
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
  onPreview?: () => Promise<void> | void
): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  const source = await page.findByTestId(sourceTestID, {}, { timeout: 4_000 });
  const target = await page.findByTestId(targetTestID, {}, { timeout: 4_000 });
  const DataTransferConstructor = canvasElement.ownerDocument.defaultView?.DataTransfer;
  const DragEventConstructor = canvasElement.ownerDocument.defaultView?.DragEvent;
  if (!DataTransferConstructor || !DragEventConstructor) {
    throw new Error("This browser does not expose the APIs required to test drag-and-drop");
  }
  const dataTransfer = new DataTransferConstructor();
  const dispatchDragEvent = (element: HTMLElement, type: string): void => {
    element.dispatchEvent(new DragEventConstructor(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer
    }));
  };

  dispatchDragEvent(source, "dragstart");
  dispatchDragEvent(target, "dragenter");
  dispatchDragEvent(target, "dragover");
  await onPreview?.();
  dispatchDragEvent(target, "drop");
  dispatchDragEvent(source, "dragend");
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
