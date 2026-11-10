import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const metadataUrl = new URL(
  "../config/google-play-metadata-en-us-mobile-1.6-v2.json",
  import.meta.url,
);
const storyUrl = new URL(
  "../config/app-store-marketing-story-v1.json",
  import.meta.url,
);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("1.6 Google Play screenshot alt text is versioned, canonical, and approval-gated", async () => {
  const [metadata, story] = await Promise.all([
    readJson(metadataUrl),
    readJson(storyUrl),
  ]);
  const campaign = story.releaseCampaign;
  const screenshots = metadata.previewAssets.screenshots;

  assert.equal(metadata.metadataId, "google-play-en-us-mobile-1.6-v2");
  assert.equal(metadata.locale, "en-US");
  assert.equal(metadata.listingStatus, "draft-pending-owner-approval");
  assert.deepEqual(metadata.releaseCampaign, {
    id: campaign.id,
    publicVersion: campaign.publicVersion,
    status: campaign.status,
  });
  assert.equal(
    screenshots.sharedStoryContract,
    "config/app-store-marketing-story-v1.json#releaseCampaign",
  );
  assert.deepEqual(
    screenshots.frames.map(({ headline, id }) => ({ headline, id })),
    campaign.frames.map(({ headline, id }) => ({ headline, id })),
  );
  assert.deepEqual(
    screenshots.deviceTypes.map(({ captureCount, id, status }) => ({
      captureCount,
      id,
      status,
    })),
    [{ id: "phone", captureCount: 6, status: "draft-pending-owner-approval" }],
  );

  for (const frame of screenshots.frames) {
    assert.ok(frame.altText.trim());
    assert.ok(
      [...frame.altText].length <= metadata.limits.graphicAltTextCharacters,
    );
    assert.ok(!/^(image|photo|picture) of\b/iu.test(frame.altText));
  }
});
