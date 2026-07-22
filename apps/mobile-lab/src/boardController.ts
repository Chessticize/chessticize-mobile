import type { PracticeService } from "../../../packages/storage/src/practice-service.ts";

let currentService: PracticeService | null = null;
let puzzleEntryPreviewEnabled = false;
let puzzleEntryPreviewPuzzleId: string | null = null;

export function setLabPracticeService(
  service: PracticeService,
  entryPreviewEnabled = false,
  entryPreviewPuzzleId: string | null = null
): void {
  currentService = service;
  puzzleEntryPreviewEnabled = entryPreviewEnabled;
  puzzleEntryPreviewPuzzleId = entryPreviewPuzzleId;
}

export function getLabPracticeService(): PracticeService | null {
  return currentService;
}

export function isLabPuzzleEntryPreviewEnabled(): boolean {
  return puzzleEntryPreviewEnabled;
}

export function getLabPuzzleEntryPreviewPuzzleId(): string | null {
  return puzzleEntryPreviewPuzzleId;
}

export function clearLabPracticeService(service: PracticeService): void {
  if (currentService === service) {
    currentService = null;
    puzzleEntryPreviewEnabled = false;
    puzzleEntryPreviewPuzzleId = null;
  }
}
