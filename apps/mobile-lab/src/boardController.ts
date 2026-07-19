import type { PracticeService } from "../../../packages/storage/src/practice-service.ts";

let currentService: PracticeService | null = null;

export function setLabPracticeService(service: PracticeService): void {
  currentService = service;
}

export function getLabPracticeService(): PracticeService | null {
  return currentService;
}

export function clearLabPracticeService(service: PracticeService): void {
  if (currentService === service) {
    currentService = null;
  }
}
