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

  it("keeps haptics on main while audio stays asynchronous", () => {
    const playMethod = source.slice(
      source.indexOf("RCT_EXPORT_METHOD(play:"),
      source.indexOf("- (void)playSoundForCue:")
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
    expect(mainQueueBlock?.[1]).not.toContain("scheduleBuffer");
    expect(mainQueueBlock?.[1]).not.toContain("[playerNode play]");
    expect(playMethod).toMatch(
      /if \(playSound\) \{\s*dispatch_async\(self\.audioQueue, \^\{\s*\[self playSoundForCue:cue\];\s*\}\);\s*\}\s*resolve\(nil\);/
    );
  });

  it("decodes both cues into resident PCM buffers and starts a warm four-node engine", () => {
    expect(source).not.toMatch(/\bAVAudioPlayer\b/);
    expect(source).toContain(
      "@property (nonatomic, strong) AVAudioEngine *audioEngine;"
    );
    expect(source).toContain(
      "@property (nonatomic, strong, nullable) AVAudioPCMBuffer *moveBuffer;"
    );
    expect(source).toContain(
      "@property (nonatomic, strong, nullable) AVAudioPCMBuffer *captureBuffer;"
    );
    expect(source).toMatch(
      /AVAudioFile \*file = \[\[AVAudioFile alloc\] initForReading:url error:&fileError\]/
    );
    expect(source).toMatch(
      /initWithPCMFormat:file\.processingFormat\s*frameCapacity:\(AVAudioFrameCount\)file\.length/
    );
    expect(source).toMatch(
      /\[file readIntoBuffer:buffer error:&readError\]/
    );
    expect(source).toMatch(
      /for \(NSUInteger index = 0; index < 4; index\+\+\)[\s\S]*AVAudioPlayerNode[\s\S]*attachNode:playerNode[\s\S]*connect:playerNode[\s\S]*to:self\.audioEngine\.mainMixerNode[\s\S]*format:processingFormat/
    );
    expect(source).toContain("self.audioEngine.autoShutdownEnabled = NO;");
    expect(source).toContain("[self.audioEngine prepare];");
    expect(source).toContain("[self startAudioEngine]");
  });

  it("round-robins overlapping cue buffers without stopping another node", () => {
    const playSoundMethod = source.slice(
      source.indexOf("- (void)playSoundForCue:"),
      source.indexOf("- (void)configureAudioEngine")
    );

    expect(playSoundMethod).toMatch(
      /\[cue isEqualToString:@"capture"\]\s*\?\s*self\.captureBuffer\s*:\s*self\.moveBuffer/
    );
    expect(playSoundMethod).toMatch(
      /self\.nextPlayerNodeIndex % self\.playerNodes\.count/
    );
    expect(playSoundMethod).toMatch(
      /self\.nextPlayerNodeIndex = \(playerNodeIndex \+ 1\) % self\.playerNodes\.count/
    );
    expect(playSoundMethod).toMatch(
      /playerNode\.volume = \[cue isEqualToString:@"capture"\] \? 0\.3 : 1\.0/
    );
    expect(playSoundMethod).toContain(
      "[playerNode scheduleBuffer:buffer atTime:nil options:0 completionHandler:nil];"
    );
    expect(playSoundMethod).toContain("[playerNode play];");
    expect(playSoundMethod).not.toContain("currentTime");
    expect(playSoundMethod).not.toContain(" stop]");
  });

  it("silently restarts the engine after interruptions and configuration changes", () => {
    expect(source).toMatch(
      /addObserver:self\s*selector:@selector\(handleAudioSessionInterruption:\)\s*name:AVAudioSessionInterruptionNotification\s*object:session/
    );
    expect(source).toMatch(
      /addObserver:self\s*selector:@selector\(handleAudioEngineConfigurationChange:\)\s*name:AVAudioEngineConfigurationChangeNotification\s*object:self\.audioEngine/
    );
    expect(source).toMatch(
      /handleAudioSessionInterruption:[\s\S]*AVAudioSessionInterruptionTypeKey[\s\S]*AVAudioSessionInterruptionTypeEnded[\s\S]*\[self enqueueAudioEngineRestart\]/
    );
    expect(source).toMatch(
      /handleAudioEngineConfigurationChange:[\s\S]*\[self enqueueAudioEngineRestart\]/
    );
    expect(source).toMatch(
      /enqueueAudioEngineRestart[\s\S]*dispatch_async\(self\.audioQueue, \^\{[\s\S]*\[self restartAudioEngine\]/
    );
    expect(source).toMatch(
      /restartAudioEngine[\s\S]*\[self\.audioEngine stop\][\s\S]*\[self\.audioEngine prepare\][\s\S]*\[self startAudioEngine\]/
    );
    expect(source).toContain(
      "[[NSNotificationCenter defaultCenter] removeObserver:self];"
    );
    expect(source).not.toContain("NSLog");
  });

  it("preserves the audio session and native bridge contracts", () => {
    expect(source).toContain(
      "playSound:(BOOL)playSound\n                  playHaptic:(BOOL)playHaptic"
    );
    expect(source).toContain(
      'reject(@"invalid_cue", @"Move feedback cue must be move or capture.", nil);'
    );
    expect(source).toContain("AVAudioSessionCategoryAmbient");
    expect(source).toContain("AVAudioSessionCategoryOptionMixWithOthers");
  });
});
