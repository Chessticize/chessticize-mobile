import {
  FakeAppStoreReviewRequestClient,
  createNativeAppStoreReviewRequestClient
} from "../src/platform/appStoreReviewRequest";

describe("App Store review request boundary", () => {
  it("forwards one request to the native StoreKit module", async () => {
    const requestReview = jest.fn(async () => true);
    const client = createNativeAppStoreReviewRequestClient({ requestReview });

    await expect(client?.requestReview()).resolves.toBe(true);

    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("reports when the native boundary could not call StoreKit", async () => {
    const client = createNativeAppStoreReviewRequestClient({
      requestReview: async () => false
    });

    await expect(client?.requestReview()).resolves.toBe(false);
  });

  it("fails closed when the native module is unavailable", () => {
    expect(createNativeAppStoreReviewRequestClient(undefined)).toBeNull();
    expect(createNativeAppStoreReviewRequestClient({})).toBeNull();
  });

  it("provides a maintained fake for component behavior tests", async () => {
    const client = new FakeAppStoreReviewRequestClient();

    await expect(client.requestReview()).resolves.toBe(true);
    await expect(client.requestReview()).resolves.toBe(true);

    expect(client.requestCount).toBe(2);
  });
});
