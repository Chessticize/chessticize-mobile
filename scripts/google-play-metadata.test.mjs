import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const metadataUrl = new URL(
  "../config/google-play-metadata-en-us-v1.json",
  import.meta.url
);
const sharedStoryUrl = new URL(
  "../config/app-store-marketing-story-v1.json",
  import.meta.url
);
const listingDocUrl = new URL(
  "../docs/ANDROID_PLAY_LISTING.md",
  import.meta.url
);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function characterCount(value) {
  return Array.from(value).length;
}

function assertValidPublicHttpsUrl(value, field) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${field} must use HTTPS`);
  assert.equal(url.username, "", `${field} must not include credentials`);
  assert.equal(url.password, "", `${field} must not include credentials`);
  assert.equal(url.hash, "", `${field} must not include a fragment`);
}

test("Google Play en-US copy is canonical, paste-ready, and within Unicode limits", async () => {
  const metadata = await readJson(metadataUrl);

  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.metadataId, "google-play-en-us-v1");
  assert.equal(metadata.issue, 444);
  assert.equal(metadata.locale, "en-US");
  assert.equal(metadata.appName, "Chessticize: Chess Puzzles");
  assert.equal(metadata.listingSettings.defaultLanguage, "English (United States)");
  assert.equal(metadata.listingSettings.appOrGame, "Game");
  assert.equal(metadata.listingSettings.category, "Board");

  assert.ok(
    characterCount(metadata.appName) <= metadata.limits.appNameCharacters
  );
  assert.ok(
    characterCount(metadata.shortDescription) <=
      metadata.limits.shortDescriptionCharacters
  );
  assert.ok(
    characterCount(metadata.fullDescription) <=
      metadata.limits.fullDescriptionCharacters
  );
  assert.notEqual(metadata.shortDescription.trim(), "");
  assert.notEqual(metadata.fullDescription.trim(), "");
  assert.ok(
    metadata.shortDescription.startsWith("Offline chess puzzle trainer"),
  );
  assert.ok(metadata.fullDescription.startsWith("Practice chess puzzles with purpose"));
  assert.ok(!metadata.fullDescription.includes(metadata.shortDescription));

  const storeCopy = `${metadata.appName}\n${metadata.shortDescription}\n${metadata.fullDescription}`;
  for (const prohibitedClaim of metadata.prohibitedClaims) {
    assert.ok(
      !storeCopy.toLocaleLowerCase("en-US").includes(
        prohibitedClaim.toLocaleLowerCase("en-US")
      ),
      `Store copy must not claim ${prohibitedClaim}`
    );
  }

  assert.ok(!/https?:\/\//u.test(metadata.fullDescription));
  assert.ok(!/(#1|best of play|limited time|download now|install now)/iu.test(storeCopy));
  assert.ok(!/[😀-🙏]/u.test(metadata.appName));
  assert.ok(!("keywords" in metadata), "Google Play has no Apple-style keyword field");
});

test("public contact fields and graphic alt text are safe and complete", async () => {
  const metadata = await readJson(metadataUrl);

  assert.match(
    metadata.contact.supportEmail,
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/u
  );
  for (const [field, value] of Object.entries(metadata.contact)) {
    if (field === "supportEmail") {
      continue;
    }
    assertValidPublicHttpsUrl(value, field);
  }

  for (const asset of [
    metadata.previewAssets.appIcon,
    metadata.previewAssets.featureGraphic
  ]) {
    await access(new URL(`../${asset.path}`, import.meta.url));
    assert.ok(characterCount(asset.altText) > 0);
    assert.ok(
      characterCount(asset.altText) <=
        metadata.limits.graphicAltTextCharacters
    );
    assert.ok(!/^(image|photo|picture) of\b/iu.test(asset.altText));
  }
});

test("the reusable six-frame story has Play alt text and one required phone set", async () => {
  const [metadata, sharedStory] = await Promise.all([
    readJson(metadataUrl),
    readJson(sharedStoryUrl)
  ]);
  const screenshots = metadata.previewAssets.screenshots;

  assert.equal(screenshots.sharedStoryContract, "config/app-store-marketing-story-v1.json");
  assert.deepEqual(
    screenshots.deviceTypes.map((device) => device.id),
    ["phone"]
  );
  for (const device of screenshots.deviceTypes) {
    assert.equal(device.captureCount, screenshots.frames.length);
    assert.ok(
      device.captureCount <= metadata.limits.screenshotsPerDeviceType
    );
    assert.equal(device.status, "ready-for-console-upload");
  }
  assert.deepEqual(screenshots.capturePolicy.requiredDeviceTypes, ["phone"]);
  assert.equal(
    screenshots.capturePolicy.source,
    "owner-approved-self-built-android-capture",
  );
  assert.equal(
    screenshots.capturePolicy.presentation,
    "generic-android-center-punch-hole-no-dynamic-island",
  );

  assert.deepEqual(
    screenshots.frames.map(({ id, headline }) => ({ id, headline })),
    sharedStory.frames.map(({ id, headline }) => ({ id, headline }))
  );
  for (const frame of screenshots.frames) {
    assert.ok(characterCount(frame.altText) > 0);
    assert.ok(
      characterCount(frame.altText) <=
        metadata.limits.graphicAltTextCharacters
    );
    assert.ok(!/^(image|photo|picture) of\b/iu.test(frame.altText));
  }
});

test("every store claim remains bound to version-controlled Android evidence", async () => {
  const metadata = await readJson(metadataUrl);

  for (const evidence of metadata.truthEvidence) {
    const contents = await readFile(
      new URL(`../${evidence.source}`, import.meta.url),
      "utf8"
    );
    for (const requiredText of evidence.mustContain ?? []) {
      assert.ok(
        contents.includes(requiredText),
        `${evidence.id} must retain ${JSON.stringify(requiredText)}`
      );
    }
    for (const forbiddenText of evidence.mustNotContain ?? []) {
      assert.ok(
        !contents.includes(forbiddenText),
        `${evidence.id} must not contain ${JSON.stringify(forbiddenText)}`
      );
    }
  }
});

test("Android listing documentation mirrors the canonical Play contract", async () => {
  const [metadata, listingDoc] = await Promise.all([
    readJson(metadataUrl),
    readFile(listingDocUrl, "utf8")
  ]);

  assert.ok(listingDoc.includes("config/google-play-metadata-en-us-v1.json"));
  assert.ok(listingDoc.includes(`- App name: \`${metadata.appName}\``));
  assert.ok(
    listingDoc.includes(
      `- Short description: \`${metadata.shortDescription}\``
    )
  );
  assert.ok(
    listingDoc.includes(`- Support URL: \`${metadata.contact.supportUrl}\``)
  );
  assert.ok(
    listingDoc.includes(`- Marketing URL: \`${metadata.contact.marketingUrl}\``)
  );
  assert.ok(
    listingDoc.includes(
      `- Android install URL: \`${metadata.contact.androidInstallUrl}\``
    )
  );
  assert.ok(
    listingDoc.includes(
      `- Accessibility URL: \`${metadata.contact.accessibilityUrl}\``
    )
  );
  assert.ok(
    listingDoc.includes(
      `- Privacy policy: \`${metadata.contact.privacyPolicyUrl}\``
    )
  );
  assert.ok(
    listingDoc.includes(`- Source: \`${metadata.contact.sourceUrl}\``)
  );
  assert.ok(listingDoc.includes(metadata.fullDescription));
  assert.ok(listingDoc.includes("owner-approved self-built deterministic capture"));
  assert.ok(listingDoc.includes("Dynamic Island"));
});
