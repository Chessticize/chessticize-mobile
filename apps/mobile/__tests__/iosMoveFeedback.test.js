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
      /if \(playSound\) \{\s*dispatch_async\(self\.audioQueue, \^\{\s*\[self\.pendingSoundCues addObject:cue\];\s*\[self playNextQueuedSound\];\s*\}\);\s*\}\s*resolve\(nil\);/
    );
  });

  it("waits for each sound to finish before starting the next queued cue", () => {
    expect(source).toContain(
      "@interface MoveFeedback : NSObject <RCTBridgeModule, AVAudioPlayerDelegate>"
    );
    expect(source).toContain(
      "@property (nonatomic, strong) NSMutableArray<NSString *> *pendingSoundCues;"
    );
    expect(source).toContain(
      "@property (nonatomic, strong, nullable) AVAudioPlayer *activePlayer;"
    );
    expect(source).toContain("self.movePlayer.delegate = self;");
    expect(source).toContain("self.capturePlayer.delegate = self;");
    expect(source).toMatch(
      /- \(void\)playNextQueuedSound[\s\S]*self\.activePlayer != nil[\s\S]*self\.pendingSoundCues\.count == 0[\s\S]*removeObjectAtIndex:0[\s\S]*player\.currentTime = 0;[\s\S]*self\.activePlayer = player;[\s\S]*\[player play\]/
    );
    expect(source).toMatch(
      /- \(void\)completePlaybackForPlayer:[\s\S]*dispatch_async\(self\.audioQueue, \^\{[\s\S]*player != self\.activePlayer \|\| player\.isPlaying[\s\S]*self\.activePlayer = nil;[\s\S]*\[self playNextQueuedSound\]/
    );
    expect(source).toMatch(
      /audioPlayerDidFinishPlaying:[\s\S]*\[self completePlaybackForPlayer:player\]/
    );
    expect(source).toMatch(
      /audioPlayerDecodeErrorDidOccur:[\s\S]*\[self completePlaybackForPlayer:player\]/
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
