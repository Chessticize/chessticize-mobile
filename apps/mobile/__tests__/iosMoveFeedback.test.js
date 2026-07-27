const { readFileSync } = require("node:fs");
const { join } = require("node:path");

describe("iOS move feedback", () => {
  const source = readFileSync(
    join(process.cwd(), "ios", "ChessticizeMobile", "MoveFeedback.m"),
    "utf8"
  );

  it("uses a medium impact for committed player moves", () => {
    expect(source).toContain("UIImpactFeedbackStyleMedium");
    expect(source).not.toContain("UIImpactFeedbackStyleLight");
  });

  it("keeps audio playback off the main queue without delaying resolution", () => {
    const playMethod = source.slice(
      source.indexOf("RCT_EXPORT_METHOD(play:"),
      source.indexOf("- (nullable AVAudioPlayer *)playerForResource:")
    );
    const mainQueueBlock = playMethod.match(
      /dispatch_async\(dispatch_get_main_queue\(\), \^\{([\s\S]*?)\n {4}\}\);/
    );

    expect(source).toContain(
      '@property (nonatomic, strong) dispatch_queue_t audioQueue;'
    );
    expect(source).toMatch(
      /dispatch_queue_create\(\s*"com\.chessticize\.movefeedback\.audio",\s*DISPATCH_QUEUE_SERIAL\s*\)/
    );
    expect(mainQueueBlock?.[1]).toContain("[self.impactGenerator impactOccurred]");
    expect(mainQueueBlock?.[1]).not.toContain("[player play]");
    expect(playMethod).toMatch(
      /if \(playSound\) \{[\s\S]*dispatch_async\(self\.audioQueue, \^\{[\s\S]*player\.currentTime = 0;[\s\S]*\[player play\];\s*\}\);\s*\}\s*resolve\(nil\);/
    );
  });

  it("preserves the native bridge contract and cue mapping", () => {
    expect(source).toContain(
      "playSound:(BOOL)playSound\n                  playHaptic:(BOOL)playHaptic"
    );
    expect(source).toContain(
      'reject(@"invalid_cue", @"Move feedback cue must be move or capture.", nil);'
    );
    expect(source).toContain("self.movePlayer.volume = 1.0;");
    expect(source).toContain("self.capturePlayer.volume = 0.3;");
    expect(source).toMatch(
      /\[cue isEqualToString:@"capture"\]\s*\?\s*self\.capturePlayer\s*:\s*self\.movePlayer/
    );
  });
});
