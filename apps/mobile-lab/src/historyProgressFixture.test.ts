import assert from "node:assert/strict";
import test from "node:test";
import { historyProgressPresentationFor } from "./historyProgressFixture.ts";

test("history progress fixture shows accuracy and speed progress", () => {
  const presentation = historyProgressPresentationFor("history-progress");
  const forks = presentation.strengths.find((strength) => strength.id === "forks");
  const forkSpeed = presentation.strengths.find(
    (strength) => strength.id === "forks-speed"
  );
  const pins = presentation.strengths.find((strength) => strength.id === "pins");

  assert.ok(forks);
  assert.ok(forkSpeed);
  assert.ok(pins);
  assert.equal(presentation.assurance, "provisional");
  assert.equal(presentation.initialSeriesId, "forks");
  assert.equal(forks.kind, "solve_rate");
  assert.equal(forks.points[0]?.valueLabel, "78%");
  assert.equal(forks.points.at(-1)?.valueLabel, "94%");
  assert.equal(forks.changeLabel, "16 points higher");
  assert.equal(
    forks.baselineLabel,
    "Recent attempts and stronger theme matches contribute more to n"
  );
  assert.equal(forkSpeed.kind, "completed_speed");
  assert.equal(forkSpeed.points.at(-1)?.valueLabel, "1.09×");
  assert.equal(
    forkSpeed.baselineLabel,
    "1.00× matches your comparable completed puzzles"
  );
  assert.equal(
    forkSpeed.summary,
    "n includes model-weighted correct solves completed before timeout; speed starts after enough personal controls."
  );
  assert.equal(pins.kind, "completed_speed");
  assert.equal(pins.points[0]?.valueLabel, "1.30×");
  assert.equal(pins.points.at(-1)?.valueLabel, "1.06×");
  assert.equal(presentation.weakness, undefined);
});

test("existing populated History clone exposes the approved progress entry", () => {
  const presentation = historyProgressPresentationFor("history-populated");

  assert.equal(presentation.initialSeriesId, "forks");
  assert.equal(presentation.strengths.length, 3);
});

test("history solve-rate weakness fixture mirrors the model effect", () => {
  const presentation = historyProgressPresentationFor(
    "history-progress-weakness"
  );
  const weakness = presentation.weakness;

  assert.ok(weakness);
  assert.equal(presentation.initialSeriesId, "skewers");
  assert.equal(weakness.label, "Skewers");
  assert.equal(weakness.reason, "solve_rate");
  assert.equal(weakness.effects[0]?.valueLabel, "14 extra misses");
  assert.match(weakness.effects[0]?.comparisonLabel ?? "", /Other well-sampled themes/);
  assert.match(weakness.explanation, /evidence, practical-impact, and diversity/);
  assert.match(weakness.evidenceLabel, /6 sessions/);
});

test("history speed weakness uses reliable completed-puzzle time", () => {
  const presentation = historyProgressPresentationFor(
    "history-progress-speed-weakness"
  );
  const weakness = presentation.weakness;

  assert.ok(weakness);
  assert.equal(presentation.initialSeriesId, "pins");
  assert.equal(weakness.label, "Pins");
  assert.equal(weakness.reason, "completed_speed");
  assert.equal(weakness.effects[0]?.valueLabel, "1.34× comparable time");
  assert.match(weakness.effects[0]?.comparisonLabel ?? "", /34% longer/);
  assert.match(
    weakness.effects[0]?.comparisonLabel ?? "",
    /other well-sampled themes/i
  );
  assert.match(weakness.eligibilityLabel, /correct, before-timeout/);
  assert.match(weakness.eligibilityLabel, /personal controls/);
  assert.match(weakness.eligibilityLabel, /Slow, Unclear, and Review/);
});
