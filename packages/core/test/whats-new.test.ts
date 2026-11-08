import test from "node:test";
import assert from "node:assert/strict";
import {
  canPresentWhatsNew,
  compareReleaseVersions,
  decideWhatsNewOnLaunch,
  parseReleaseVersion,
  whatsNewVersionToRecord,
  type WhatsNewLaunchInput,
  type WhatsNewPresentationContext
} from "../src/index.ts";

const RELEASE = "1.6.0";

function launch(overrides: Partial<WhatsNewLaunchInput>): ReturnType<typeof decideWhatsNewOnLaunch> {
  return decideWhatsNewOnLaunch({
    releaseVersion: RELEASE,
    appVersion: "1.6.0",
    hasExistingProgress: true,
    ...overrides
  });
}

test("release versions parse their leading numbers and reject anything else", () => {
  assert.deepEqual(parseReleaseVersion("1.6.0"), [1, 6, 0]);
  assert.deepEqual(parseReleaseVersion(" 1.10.2 "), [1, 10, 2]);
  assert.deepEqual(parseReleaseVersion("1.6"), [1, 6, 0]);
  assert.deepEqual(parseReleaseVersion("1.6.0-dev"), [1, 6, 0]);
  for (const bad of ["", "abc", "1", "1.x.0", "1.6.0.1", "v1.6.0", undefined]) {
    assert.equal(parseReleaseVersion(bad), undefined, String(bad));
  }
});

test("release versions compare numerically, not as text", () => {
  const compare = (left: string, right: string): number =>
    Math.sign(compareReleaseVersions(parseReleaseVersion(left)!, parseReleaseVersion(right)!));
  assert.equal(compare("1.5.3", "1.6.0"), -1);
  assert.equal(compare("1.6.0", "1.6.0"), 0);
  assert.equal(compare("1.6.1", "1.6.0"), 1);
  assert.equal(compare("1.10.0", "1.9.9"), 1);
  assert.equal(compare("2.0.0", "1.99.99"), 1);
});

test("an update from a release that never recorded a version shows the notes", () => {
  assert.deepEqual(launch({ lastSeenVersion: undefined, hasExistingProgress: true }), { show: true });
});

test("an update from a recorded older version shows the notes", () => {
  assert.deepEqual(launch({ lastSeenVersion: "1.5.3", hasExistingProgress: true }), { show: true });
  assert.deepEqual(launch({ lastSeenVersion: "1.5.3", hasExistingProgress: false }), { show: true });
  assert.deepEqual(launch({ appVersion: "1.7.0", lastSeenVersion: "1.5.3" }), { show: true });
});

test("a fresh install never shows the notes and records the running version", () => {
  assert.deepEqual(
    launch({ lastSeenVersion: undefined, hasExistingProgress: false }),
    { show: false, recordSeenVersion: "1.6.0" }
  );
  assert.deepEqual(
    launch({ appVersion: "1.7.2", lastSeenVersion: undefined, hasExistingProgress: false }),
    { show: false, recordSeenVersion: "1.7.2" }
  );
});

test("notes already seen at or after the release are not shown again", () => {
  assert.deepEqual(launch({ lastSeenVersion: "1.6.0" }), { show: false });
  assert.deepEqual(launch({ lastSeenVersion: "1.6.4" }), { show: false });
  assert.deepEqual(launch({ appVersion: "1.7.0", lastSeenVersion: "1.7.0" }), { show: false });
});

test("a build older than the release shows nothing and records nothing", () => {
  assert.deepEqual(launch({ appVersion: "1.5.3", lastSeenVersion: undefined }), { show: false });
  assert.deepEqual(
    launch({ appVersion: "1.5.3", lastSeenVersion: undefined, hasExistingProgress: false }),
    { show: false }
  );
  assert.deepEqual(launch({ appVersion: "1.5.9", lastSeenVersion: "1.5.0" }), { show: false });
});

test("an unreadable app version shows nothing", () => {
  assert.deepEqual(launch({ appVersion: "test-version" }), { show: false });
  assert.deepEqual(launch({ appVersion: "" }), { show: false });
});

test("a dev build suffix still compares by its release numbers", () => {
  assert.deepEqual(launch({ appVersion: "1.6.0-dev", lastSeenVersion: "1.5.3" }), { show: true });
});

test("finishing the notes records the newer of the running app and the release", () => {
  assert.equal(whatsNewVersionToRecord("1.6.0", "1.6.0"), "1.6.0");
  assert.equal(whatsNewVersionToRecord("1.6.0", "1.7.1"), "1.7.1");
  // A Dev build simulating the update still marks the release itself as seen.
  assert.equal(whatsNewVersionToRecord("1.6.0", "1.5.3"), "1.6.0");
  assert.equal(whatsNewVersionToRecord("1.6.0", "test-version"), "1.6.0");
});

function presentation(overrides: Partial<WhatsNewPresentationContext>): boolean {
  return canPresentWhatsNew({
    practiceTabSelected: true,
    openRun: false,
    resumableRun: false,
    otherSurfaceActive: false,
    ...overrides
  });
}

test("the notes appear only on an idle Practice home", () => {
  assert.equal(presentation({}), true);
});

test("the notes never interrupt an active, paused or resumable Run", () => {
  assert.equal(presentation({ openRun: true }), false);
  assert.equal(presentation({ resumableRun: true }), false);
});

test("the notes wait while another tab or a first-run surface owns the screen", () => {
  assert.equal(presentation({ practiceTabSelected: false }), false);
  assert.equal(presentation({ otherSurfaceActive: true }), false);
});
