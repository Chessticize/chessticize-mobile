import { userEvent, within } from "storybook/test";

export async function clickTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByTestId(testID, {}, { timeout: 4_000 }));
}

export async function waitForTestId(canvasElement: HTMLElement, testID: string): Promise<void> {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByTestId(testID, {}, { timeout: 4_000 });
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
