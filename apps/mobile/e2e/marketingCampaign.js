function resolveMarketingCampaign(story, campaignId) {
  const requested = String(campaignId ?? '').trim();
  if (!requested) {
    return story;
  }
  const campaign = story.releaseCampaign;
  if (!campaign || requested !== campaign.id) {
    throw new Error(
      `CHESSTICIZE_MARKETING_CAMPAIGN must name ${campaign?.id ?? 'an approved campaign'}.`
    );
  }
  const frames = campaign.frames
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((frame) => ({
      ...frame,
      captureId: frame.id,
      source: {
        screen: frame.storyId,
      },
    }));
  return {
    ...story,
    schemaVersion: 2,
    storyId: campaign.id,
    issue: campaign.issue,
    sourceBuild: {
      kind: campaign.captureRequirements.source,
      puzzlePack: story.sourceBuild.puzzlePack,
    },
    campaign: {
      id: campaign.id,
      publicVersion: campaign.publicVersion,
      status: campaign.status,
    },
    frames,
  };
}

module.exports = {
  resolveMarketingCampaign,
};
