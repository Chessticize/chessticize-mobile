#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface MoveFeedback : NSObject <RCTBridgeModule>
@property (nonatomic, strong, nullable) AVAudioPlayer *movePlayer;
@property (nonatomic, strong, nullable) AVAudioPlayer *capturePlayer;
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
    self.movePlayer = [self playerForResource:@"freesound-546119-piece-placement"];
    self.capturePlayer = [self playerForResource:@"freesound-546120-piece-capture"];
    self.movePlayer.volume = 1.0;
    self.capturePlayer.volume = 0.3;
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
    AVAudioPlayer *player = [cue isEqualToString:@"capture"]
      ? self.capturePlayer
      : self.movePlayer;
    dispatch_async(self.audioQueue, ^{
      player.currentTime = 0;
      [player play];
    });
  }

  resolve(nil);
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
