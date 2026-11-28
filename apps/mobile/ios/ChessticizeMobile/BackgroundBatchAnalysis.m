#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>

static NSString * const ChessticizeBatchAnalysisEventName = @"BackgroundBatchAnalysisEvent";
static NSString * const ChessticizeBatchAnalysisCompletionNotificationId = @"chessticize.batchAnalysis.completed";

@interface BackgroundBatchAnalysis : RCTEventEmitter <RCTBridgeModule>
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, assign) NSUInteger sessionGeneration;
@property (nonatomic, assign) UIBackgroundTaskIdentifier backgroundTaskID;
@end

@implementation BackgroundBatchAnalysis

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _backgroundTaskID = UIBackgroundTaskInvalid;
  }
  return self;
}

- (void)dealloc
{
  [self stopSession];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ChessticizeBatchAnalysisEventName];
}

- (void)startObserving
{
  @synchronized (self) {
    self.hasListeners = YES;
  }
}

- (void)stopObserving
{
  @synchronized (self) {
    self.hasListeners = NO;
  }
}

- (void)emitBridgeEvent:(NSString *)eventType
{
  BOOL canEmit = NO;
  @synchronized (self) {
    canEmit = self.hasListeners;
  }
  if (!canEmit || eventType.length == 0) {
    return;
  }
  [self sendEventWithName:ChessticizeBatchAnalysisEventName body:@{ @"type": eventType }];
}

- (void)endBackgroundTaskLocked
{
  UIBackgroundTaskIdentifier taskID = self.backgroundTaskID;
  self.backgroundTaskID = UIBackgroundTaskInvalid;
  if (taskID != UIBackgroundTaskInvalid) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [[UIApplication sharedApplication] endBackgroundTask:taskID];
    });
  }
}

- (void)stopSession
{
  @synchronized (self) {
    self.sessionGeneration += 1;
    [self endBackgroundTaskLocked];
  }
}

RCT_EXPORT_METHOD(start:(__unused NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self stopSession];

  NSUInteger generation = 0;
  @synchronized (self) {
    self.sessionGeneration += 1;
    generation = self.sessionGeneration;
  }

  __weak typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) {
      resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
      return;
    }

    // Protect SQLite checkpoint writes while proactively pausing on background/screen lock.
    // iOS strictly throttles heavy CPU work like Stockfish when the screen locks, so we return
    // supportsContinuedBackground = NO and let JS pause cleanly instead of triggering a
    // BGContinuedProcessingTask "Task failed" alert on the Lock Screen.
    UIBackgroundTaskIdentifier taskID = [[UIApplication sharedApplication]
      beginBackgroundTaskWithName:@"com.chessticize.batch-analysis-checkpoint"
                expirationHandler:^{
      __strong typeof(weakSelf) innerSelf = weakSelf;
      if (innerSelf == nil) {
        return;
      }
      BOOL shouldNotifyExpiration = NO;
      @synchronized (innerSelf) {
        if (innerSelf.sessionGeneration == generation) {
          shouldNotifyExpiration = YES;
        }
        [innerSelf endBackgroundTaskLocked];
      }
      if (shouldNotifyExpiration) {
        [innerSelf emitBridgeEvent:@"expiration_warning"];
      }
    }];

    BOOL hasTask = (taskID != UIBackgroundTaskInvalid);
    @synchronized (strongSelf) {
      if (strongSelf.sessionGeneration != generation) {
        if (hasTask) {
          [[UIApplication sharedApplication] endBackgroundTask:taskID];
        }
        resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
        return;
      }
      strongSelf.backgroundTaskID = taskID;
    }

    resolve(@{
      @"active": @(hasTask),
      @"supportsContinuedBackground": @NO,
      @"mode": hasTask ? @"ios_background_task" : @"none"
    });
  });
}

RCT_EXPORT_METHOD(updateProgress:(__unused NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  resolve(nil);
}

RCT_EXPORT_METHOD(finish:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self stopSession];

  BOOL notifyIfBackgrounded = [input[@"notifyIfBackgrounded"] isKindOfClass:[NSNumber class]]
    ? [input[@"notifyIfBackgrounded"] boolValue]
    : NO;
  NSString *title = [input[@"title"] isKindOfClass:[NSString class]] && ((NSString *)input[@"title"]).length > 0
    ? input[@"title"]
    : @"Chessticize";
  NSString *body = [input[@"body"] isKindOfClass:[NSString class]] ? input[@"body"] : @"";

  if (!notifyIfBackgrounded || body.length == 0) {
    resolve(nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if ([UIApplication sharedApplication].applicationState == UIApplicationStateActive) {
      resolve(nil);
      return;
    }
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      BOOL authorized = settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
                        settings.authorizationStatus == UNAuthorizationStatusProvisional;
      if (!authorized) {
        resolve(nil);
        return;
      }
      UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
      content.title = title;
      content.body = body;
      content.sound = [UNNotificationSound defaultSound];
      content.userInfo = @{ @"route": @"games" };

      UNNotificationRequest *request = [UNNotificationRequest
        requestWithIdentifier:ChessticizeBatchAnalysisCompletionNotificationId
                      content:content
                      trigger:nil];
      [center addNotificationRequest:request withCompletionHandler:^(__unused NSError * _Nullable error) {
        resolve(nil);
      }];
    }];
  });
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self stopSession];
  resolve(nil);
}

@end
