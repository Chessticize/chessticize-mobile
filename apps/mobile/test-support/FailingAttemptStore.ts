import type { AttemptEvent } from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";

/** A reusable store-boundary fake for deterministic attempt persistence failures. */
export class FailingAttemptStore extends MemoryStore {
  private readonly failure: Error;

  constructor(message: string) {
    super();
    this.failure = new Error(message);
  }

  override recordAttempt(_attempt: AttemptEvent): void {
    throw this.failure;
  }
}
