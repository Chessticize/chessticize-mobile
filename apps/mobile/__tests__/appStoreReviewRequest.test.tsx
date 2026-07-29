import {
  FakeAppStoreReviewRequestClient,
  createNativeAppStoreReviewRequestClient
} from "../src/platform/appStoreReviewRequest";

describe("App Store review request boundary", () => {
  it("forwards one request to the native StoreKit module", async () => {
    const requestReview = jest.fn(async () => undefined);
    const client = createNativeAppStoreReviewRequestClient({ requestReview });

    await client?.requestReview();

    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the native module is unavailable", () => {
    expect(createNativeAppStoreReviewRequestClient(undefined)).toBeNull();
    expect(createNativeAppStoreReviewRequestClient({})).toBeNull();
  });

  it("provides a maintained fake for component behavior tests", async () => {
    const client = new FakeAppStoreReviewRequestClient();

    await client.requestReview();
    await client.requestReview();

    expect(client.requestCount).toBe(2);
  });
});
