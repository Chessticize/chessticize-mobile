#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface MoveFeedback : NSObject <RCTBridgeModule>
@property (nonatomic, strong) AVAudioEngine *audioEngine;
@property (nonatomic, strong, nullable) AVAudioPCMBuffer *moveBuffer;
@property (nonatomic, strong, nullable) AVAudioPCMBuffer *captureBuffer;
@property (nonatomic, copy) NSArray<AVAudioPlayerNode *> *playerNodes;
@property (nonatomic, assign) NSUInteger nextPlayerNodeIndex;
@property (nonatomic, strong) UIImpactFeedbackGenerator *impactGenerator;
@property (nonatomic, strong) dispatch_queue_t audioQueue;
@end

@implementation MoveFeedback

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    self.audioQueue = dispatch_queue_create(
      "com.chessticize.movefeedback.audio",
      DISPATCH_QUEUE_SERIAL
    );
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSError *sessionError = nil;
    [session setCategory:AVAudioSessionCategoryAmbient
                    mode:AVAudioSessionModeDefault
                 options:AVAudioSessionCategoryOptionMixWithOthers
                   error:&sessionError];
    if (sessionError == nil) {
      [session setActive:YES error:&sessionError];
    }
    [self configureAudioEngine];
    NSNotificationCenter *notificationCenter = [NSNotificationCenter defaultCenter];
    [notificationCenter addObserver:self
                           selector:@selector(handleAudioSessionInterruption:)
                               name:AVAudioSessionInterruptionNotification
                             object:session];
    [notificationCenter addObserver:self
                           selector:@selector(handleAudioEngineConfigurationChange:)
                               name:AVAudioEngineConfigurationChangeNotification
                             object:self.audioEngine];
    self.impactGenerator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
    [self.impactGenerator prepare];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  [self.audioEngine stop];
}

RCT_EXPORT_METHOD(play:(NSString *)cue
                  playSound:(BOOL)playSound
                  playHaptic:(BOOL)playHaptic
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![cue isEqualToString:@"move"] && ![cue isEqualToString:@"capture"]) {
    reject(@"invalid_cue", @"Move feedback cue must be move or capture.", nil);
    return;
  }

  if (playHaptic) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self.impactGenerator impactOccurred];
      [self.impactGenerator prepare];
    });
  }

  if (playSound) {
    dispatch_async(self.audioQueue, ^{
      [self playSoundForCue:cue];
    });
  }

  resolve(nil);
}

- (void)playSoundForCue:(NSString *)cue
{
  AVAudioPCMBuffer *buffer = [cue isEqualToString:@"capture"]
    ? self.captureBuffer
    : self.moveBuffer;
  if (buffer == nil || self.playerNodes.count == 0 || ![self startAudioEngine]) {
    return;
  }

  NSUInteger playerNodeIndex = self.nextPlayerNodeIndex % self.playerNodes.count;
  self.nextPlayerNodeIndex = (playerNodeIndex + 1) % self.playerNodes.count;
  AVAudioPlayerNode *playerNode = self.playerNodes[playerNodeIndex];
  playerNode.volume = [cue isEqualToString:@"capture"] ? 0.3 : 1.0;
  [playerNode scheduleBuffer:buffer atTime:nil options:0 completionHandler:nil];
  [playerNode play];
}

- (void)configureAudioEngine
{
  self.moveBuffer = [self pcmBufferForResource:@"freesound-546119-piece-placement"];
  self.captureBuffer = [self pcmBufferForResource:@"freesound-546120-piece-capture"];
  self.audioEngine = [[AVAudioEngine alloc] init];
  self.audioEngine.autoShutdownEnabled = NO;
  AVAudioFormat *processingFormat = self.moveBuffer.format ?: self.captureBuffer.format;
  if (processingFormat == nil) {
    self.playerNodes = @[];
    return;
  }

  NSMutableArray<AVAudioPlayerNode *> *playerNodes = [NSMutableArray arrayWithCapacity:4];
  for (NSUInteger index = 0; index < 4; index++) {
    AVAudioPlayerNode *playerNode = [[AVAudioPlayerNode alloc] init];
    [self.audioEngine attachNode:playerNode];
    [self.audioEngine connect:playerNode
                           to:self.audioEngine.mainMixerNode
                       format:processingFormat];
    [playerNodes addObject:playerNode];
  }
  self.playerNodes = playerNodes;
  [self.audioEngine prepare];
  [self startAudioEngine];
}

- (BOOL)startAudioEngine
{
  if (self.audioEngine.isRunning) {
    return YES;
  }
  NSError *engineError = nil;
  BOOL started = [self.audioEngine startAndReturnError:&engineError];
  return started && engineError == nil;
}

- (void)handleAudioSessionInterruption:(NSNotification *)notification
{
  NSNumber *interruptionType = notification.userInfo[AVAudioSessionInterruptionTypeKey];
  if (interruptionType == nil
      || interruptionType.unsignedIntegerValue != AVAudioSessionInterruptionTypeEnded) {
    return;
  }
  [self enqueueAudioEngineRestart];
}

- (void)handleAudioEngineConfigurationChange:(NSNotification *)notification
{
  (void)notification;
  [self enqueueAudioEngineRestart];
}

- (void)enqueueAudioEngineRestart
{
  dispatch_async(self.audioQueue, ^{
    [self restartAudioEngine];
  });
}

- (void)restartAudioEngine
{
  [self.audioEngine stop];
  [self.audioEngine prepare];
  [self startAudioEngine];
}

- (nullable AVAudioPCMBuffer *)pcmBufferForResource:(NSString *)resource
{
  NSURL *url = [[NSBundle mainBundle] URLForResource:resource withExtension:@"mp3"];
  if (url == nil) {
    return nil;
  }
  NSError *fileError = nil;
  AVAudioFile *file = [[AVAudioFile alloc] initForReading:url error:&fileError];
  if (file == nil || fileError != nil) {
    return nil;
  }
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc]
    initWithPCMFormat:file.processingFormat
    frameCapacity:(AVAudioFrameCount)file.length];
  if (buffer == nil) {
    return nil;
  }
  NSError *readError = nil;
  if (![file readIntoBuffer:buffer error:&readError] || readError != nil) {
    return nil;
  }
  return buffer;
}

@end
