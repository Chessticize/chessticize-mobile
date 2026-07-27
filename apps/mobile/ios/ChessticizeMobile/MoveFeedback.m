#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface MoveFeedback : NSObject <RCTBridgeModule, AVAudioPlayerDelegate>
@property (nonatomic, strong, nullable) AVAudioPlayer *movePlayer;
@property (nonatomic, strong, nullable) AVAudioPlayer *capturePlayer;
@property (nonatomic, strong, nullable) AVAudioPlayer *activePlayer;
@property (nonatomic, strong) NSMutableArray<NSString *> *pendingSoundCues;
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
    self.pendingSoundCues = [NSMutableArray array];
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSError *sessionError = nil;
    [session setCategory:AVAudioSessionCategoryAmbient
                    mode:AVAudioSessionModeDefault
                 options:AVAudioSessionCategoryOptionMixWithOthers
                   error:&sessionError];
    if (sessionError == nil) {
      [session setActive:YES error:&sessionError];
    }
    self.movePlayer = [self playerForResource:@"freesound-546119-piece-placement"];
    self.capturePlayer = [self playerForResource:@"freesound-546120-piece-capture"];
    self.movePlayer.volume = 1.0;
    self.capturePlayer.volume = 0.3;
    self.movePlayer.delegate = self;
    self.capturePlayer.delegate = self;
    [self.movePlayer prepareToPlay];
    [self.capturePlayer prepareToPlay];
    self.impactGenerator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
    [self.impactGenerator prepare];
  }
  return self;
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
      [self.pendingSoundCues addObject:cue];
      [self playNextQueuedSound];
    });
  }

  resolve(nil);
}

- (void)playNextQueuedSound
{
  if (self.activePlayer != nil || self.pendingSoundCues.count == 0) {
    return;
  }

  NSString *cue = self.pendingSoundCues.firstObject;
  [self.pendingSoundCues removeObjectAtIndex:0];
  AVAudioPlayer *player = [cue isEqualToString:@"capture"]
    ? self.capturePlayer
    : self.movePlayer;
  if (player == nil) {
    [self playNextQueuedSound];
    return;
  }

  player.currentTime = 0;
  self.activePlayer = player;
  if (![player play]) {
    self.activePlayer = nil;
    [self playNextQueuedSound];
  }
}

- (void)completePlaybackForPlayer:(AVAudioPlayer *)player
{
  dispatch_async(self.audioQueue, ^{
    if (player != self.activePlayer || player.isPlaying) {
      return;
    }
    self.activePlayer = nil;
    [self playNextQueuedSound];
  });
}

- (void)audioPlayerDidFinishPlaying:(AVAudioPlayer *)player
                       successfully:(BOOL)flag
{
  [self completePlaybackForPlayer:player];
}

- (void)audioPlayerDecodeErrorDidOccur:(AVAudioPlayer *)player
                                 error:(nullable NSError *)error
{
  [self completePlaybackForPlayer:player];
}

- (nullable AVAudioPlayer *)playerForResource:(NSString *)resource
{
  NSURL *url = [[NSBundle mainBundle] URLForResource:resource withExtension:@"mp3"];
  if (url == nil) {
    return nil;
  }
  NSError *error = nil;
  AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithContentsOfURL:url error:&error];
  return error == nil ? player : nil;
}

@end
