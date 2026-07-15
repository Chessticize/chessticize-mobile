import {
  resolveMobileBackIntent,
  type MobileBackState
} from "../src/navigation/mobileBackContract";

const rootState: MobileBackState = {
  activePractice: false,
  detail: null,
  tab: "practice",
  topTransient: null
};

describe("mobile Back contract", () => {
  it("unwinds the topmost transient before any underlying state", () => {
    expect(resolveMobileBackIntent({
      activePractice: true,
      detail: { kind: "review-analysis", owner: "history" },
      tab: "history",
      topTransient: "practice-exit-confirmation"
    }, "button")).toEqual({
      kind: "dismiss-transient",
      transient: "practice-exit-confirmation"
    });
  });

  it("returns analysis and review detail to their owning surface", () => {
    expect(resolveMobileBackIntent({
      ...rootState,
      detail: { kind: "review-analysis", owner: "history" },
      tab: "history"
    }, "button")).toEqual({ kind: "close-analysis", owner: "history" });

    expect(resolveMobileBackIntent({
      ...rootState,
      detail: { kind: "review-session", owner: "review" },
      tab: "review"
    }, "button")).toEqual({ kind: "return-to-owner", owner: "review" });

    expect(resolveMobileBackIntent({
      ...rootState,
      detail: { kind: "stockfish-diagnostics", owner: "settings" },
      tab: "analysis"
    }, "button")).toEqual({ kind: "return-to-owner", owner: "settings" });
  });

  it("guards active practice, returns non-root tabs to Practice, and delegates only at root", () => {
    expect(resolveMobileBackIntent({
      ...rootState,
      activePractice: true
    }, "button")).toEqual({ kind: "request-practice-exit" });

    expect(resolveMobileBackIntent({
      ...rootState,
      tab: "settings"
    }, "button")).toEqual({ kind: "return-to-practice" });

    expect(resolveMobileBackIntent(rootState, "button")).toEqual({ kind: "delegate-platform" });
  });

  it("resolves Predictive Back to the same destination as a button Back action", () => {
    const states: MobileBackState[] = [
      { ...rootState, topTransient: "review-reminder-prompt" },
      { ...rootState, detail: { kind: "review-analysis", owner: "review" }, tab: "review" },
      { ...rootState, activePractice: true },
      { ...rootState, tab: "history" },
      rootState
    ];

    for (const state of states) {
      expect(resolveMobileBackIntent(state, "predictive")).toEqual(
        resolveMobileBackIntent(state, "button")
      );
    }
  });
});
