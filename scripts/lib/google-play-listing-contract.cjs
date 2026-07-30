const crypto = require('node:crypto');

const LISTING_ASSET_SET_KIND =
  'chessticize.google-play-listing-asset-set';
const LISTING_ASSET_SET_SCHEMA_VERSION = 1;

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listingAssetSetDigest(assetSet) {
  const digestContract = {
    schemaVersion: assetSet?.schemaVersion,
    kind: assetSet?.kind,
    status: assetSet?.status,
    candidate: assetSet?.candidate,
    metadataContract: assetSet?.metadataContract,
    appIcon: assetSet?.appIcon,
    featureGraphic: assetSet?.featureGraphic,
    captureManifest: assetSet?.captureManifest,
    compositionManifest: assetSet?.compositionManifest,
    consoleReview: assetSet?.consoleReview,
  };
  return sha256Bytes(canonicalJson(digestContract));
}

module.exports = {
  LISTING_ASSET_SET_KIND,
  LISTING_ASSET_SET_SCHEMA_VERSION,
  canonicalJson,
  listingAssetSetDigest,
  sha256Bytes,
};
