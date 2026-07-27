import assert from "node:assert/strict";
import test from "node:test";
import { historyProgressPresentationFor } from "./historyProgressFixture.ts";

test("history progress fixture shows one theme changing over time", () => {
  const presentation = historyProgressPresentationFor("history-progress");
  const forks = presentation.strengths.find((strength) => strength.id === "forks");

  assert.ok(forks);
  assert.equal(presentation.initialSeriesId, "forks");
  assert.equal(forks.points[0]?.value, 48);
  assert.equal(forks.points.at(-1)?.value, 68);
  assert.equal(forks.changeLabel, "+20 pts");
  assert.equal(presentation.weakness, undefined);
});

test("history weakness fixture compares a statistically clear gap", () => {
  const presentation = historyProgressPresentationFor(
    "history-progress-weakness"
  );
  const weakness = presentation.weakness;

  assert.ok(weakness);
  assert.equal(presentation.initialSeriesId, "skewers");
  assert.equal(weakness.label, "Skewers");
  assert.equal(
    weakness.comparisons.find((comparison) => comparison.isWeakness)?.value,
    46
  );
  assert.match(weakness.explanation, /normal ups and downs/);
  assert.match(weakness.evidenceLabel, /6 mixed Runs/);
});
