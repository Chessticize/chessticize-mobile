import type {
  ReviewContext,
  ReviewQueueState,
  ReviewScheduleRemoval
} from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";

/** A reusable store-boundary fake for deterministic Review Schedule failures. */
export class FailingReviewScheduleStore extends MemoryStore {
  private enrollmentFailure: Error | undefined;
  private removalFailure: Error | undefined;

  setEnrollmentFailure(failure: Error | undefined): void {
    this.enrollmentFailure = failure;
  }

  setRemovalFailure(failure: Error | undefined): void {
    this.removalFailure = failure;
  }

  override enrollReview(
    context: ReviewContext,
    now: string,
    initiatingAttemptId?: string
  ): ReviewQueueState {
    if (this.enrollmentFailure) {
      throw this.enrollmentFailure;
    }
    return super.enrollReview(context, now, initiatingAttemptId);
  }

  override removeReview(context: ReviewContext, now: string): ReviewScheduleRemoval {
    if (this.removalFailure) {
      throw this.removalFailure;
    }
    return super.removeReview(context, now);
  }
}
