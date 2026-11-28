#import <BackgroundTasks/BackgroundTasks.h>
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
@property (nonatomic, strong, nullable) id activeContinuedTask;
@property (nonatomic, copy, nullable) NSString *activeContinuedTaskIdentifier;
@property (nonatomic, assign) BOOL continuedTaskCompleted;
@property (nonatomic, copy) NSString *latestTitle;
@property (nonatomic, copy) NSString *latestSubtitle;
@property (nonatomic, assign) NSInteger latestCompletedUnits;
@property (nonatomic, assign) NSInteger latestTotalUnits;
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
    _latestTitle = @"Chessticize";
    _latestSubtitle = @"";
    _latestCompletedUnits = 0;
    _latestTotalUnits = 1;
  }
  return self;
}

- (void)dealloc
{
  [self stopSessionWithSuccess:NO];
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

- (void)endTier1BackgroundTaskLocked
{
  UIBackgroundTaskIdentifier taskID = self.backgroundTaskID;
  self.backgroundTaskID = UIBackgroundTaskInvalid;
  if (taskID != UIBackgroundTaskInvalid) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [[UIApplication sharedApplication] endBackgroundTask:taskID];
    });
  }
}

- (void)stopSessionWithSuccess:(BOOL)success
{
  id continuedTaskToFinish = nil;
  NSString *pendingIdentifierToCancel = nil;
  @synchronized (self) {
    self.sessionGeneration += 1;
    if (self.activeContinuedTask != nil && !self.continuedTaskCompleted) {
      continuedTaskToFinish = self.activeContinuedTask;
      self.continuedTaskCompleted = YES;
    } else if (self.activeContinuedTaskIdentifier.length > 0) {
      pendingIdentifierToCancel = [self.activeContinuedTaskIdentifier copy];
    }
    self.activeContinuedTask = nil;
    self.activeContinuedTaskIdentifier = nil;
    [self endTier1BackgroundTaskLocked];
  }

  if (continuedTaskToFinish != nil) {
    if (@available(iOS 13.0, *)) {
      [(BGTask *)continuedTaskToFinish setTaskCompletedWithSuccess:success];
    }
  } else if (pendingIdentifierToCancel.length > 0) {
    if (@available(iOS 13.0, *)) {
      [[BGTaskScheduler sharedScheduler] cancelTaskRequestWithIdentifier:pendingIdentifierToCancel];
    }
  }
}

RCT_EXPORT_METHOD(start:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self stopSessionWithSuccess:NO];

  NSString *title = [input[@"title"] isKindOfClass:[NSString class]] && ((NSString *)input[@"title"]).length > 0
    ? input[@"title"]
    : @"Chessticize";
  NSString *subtitle = [input[@"subtitle"] isKindOfClass:[NSString class]] ? input[@"subtitle"] : @"";
  NSInteger totalUnits = [input[@"totalUnits"] isKindOfClass:[NSNumber class]]
    ? MAX(1, [input[@"totalUnits"] integerValue])
    : 1;

  NSUInteger generation = 0;
  @synchronized (self) {
    self.sessionGeneration += 1;
    generation = self.sessionGeneration;
    self.latestTitle = title;
    self.latestSubtitle = subtitle;
    self.latestCompletedUnits = 0;
    self.latestTotalUnits = totalUnits;
    self.continuedTaskCompleted = NO;
  }

  __weak typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) {
      resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
      return;
    }

    // Tier 1 (iOS 15.1+): Graceful background runway so leaving the app does not abort mid-ply.
    UIBackgroundTaskIdentifier taskID = [[UIApplication sharedApplication]
      beginBackgroundTaskWithName:@"com.chessticize.batch-analysis"
                expirationHandler:^{
      __strong typeof(weakSelf) innerSelf = weakSelf;
      if (innerSelf == nil) {
        return;
      }
      BOOL shouldNotifyExpiration = NO;
      @synchronized (innerSelf) {
        if (innerSelf.sessionGeneration == generation && innerSelf.activeContinuedTask == nil) {
          shouldNotifyExpiration = YES;
        }
        [innerSelf endTier1BackgroundTaskLocked];
      }
      if (shouldNotifyExpiration) {
        [innerSelf emitBridgeEvent:@"expiration_warning"];
      }
    }];

    BOOL hasTier1 = (taskID != UIBackgroundTaskInvalid);
    @synchronized (strongSelf) {
      if (strongSelf.sessionGeneration != generation) {
        if (hasTier1) {
          [[UIApplication sharedApplication] endBackgroundTask:taskID];
        }
        resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
        return;
      }
      strongSelf.backgroundTaskID = taskID;
    }

#if defined(__IPHONE_26_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0
    // Tier 2 (iOS 26+): System-managed BGContinuedProcessingTask with built-in Live Activity UI.
    if (@available(iOS 26.0, *)) {
      NSString *bundleId = NSBundle.mainBundle.bundleIdentifier;
      if (bundleId.length > 0) {
        NSString *suffix = [[[NSUUID UUID].UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""]
          substringToIndex:12];
        NSString *identifier = [NSString stringWithFormat:@"%@.batch-analysis.%@", bundleId, suffix];

        BOOL registered = [[BGTaskScheduler sharedScheduler]
          registerForTaskWithIdentifier:identifier
                             usingQueue:dispatch_get_global_queue(QOS_CLASS_UTILITY, 0)
                          launchHandler:^(__kindof BGTask *bgTask) {
          __strong typeof(weakSelf) handlerSelf = weakSelf;
          if (handlerSelf == nil || ![bgTask isKindOfClass:[BGContinuedProcessingTask class]]) {
            [bgTask setTaskCompletedWithSuccess:NO];
            return;
          }
          BGContinuedProcessingTask *continuedTask = (BGContinuedProcessingTask *)bgTask;
          NSString *initialTitle = @"Chessticize";
          NSString *initialSubtitle = @"";
          NSInteger initialCompleted = 0;
          NSInteger initialTotal = 1;
          @synchronized (handlerSelf) {
            if (handlerSelf.sessionGeneration != generation) {
              [continuedTask setTaskCompletedWithSuccess:NO];
              return;
            }
            handlerSelf.activeContinuedTask = continuedTask;
            handlerSelf.continuedTaskCompleted = NO;
            initialTitle = handlerSelf.latestTitle;
            initialSubtitle = handlerSelf.latestSubtitle;
            initialCompleted = handlerSelf.latestCompletedUnits;
            initialTotal = MAX(1, handlerSelf.latestTotalUnits);
          }

          continuedTask.progress.totalUnitCount = initialTotal;
          continuedTask.progress.completedUnitCount = MIN(initialCompleted, initialTotal);
          [continuedTask updateTitle:initialTitle subtitle:initialSubtitle];

          __weak BGContinuedProcessingTask *weakTask = continuedTask;
          continuedTask.expirationHandler = ^{
            __strong typeof(weakSelf) expSelf = weakSelf;
            __strong BGContinuedProcessingTask *expTask = weakTask;
            if (expSelf == nil) {
              [expTask setTaskCompletedWithSuccess:NO];
              return;
            }
            BOOL wasUserCancelled = expTask != nil && expTask.progress.isCancelled;
            BOOL shouldEmit = NO;
            @synchronized (expSelf) {
              if (expSelf.sessionGeneration == generation && !expSelf.continuedTaskCompleted) {
                expSelf.continuedTaskCompleted = YES;
                expSelf.activeContinuedTask = nil;
                expSelf.activeContinuedTaskIdentifier = nil;
                [expSelf endTier1BackgroundTaskLocked];
                shouldEmit = YES;
              }
            }
            if (shouldEmit) {
              [expSelf emitBridgeEvent:wasUserCancelled ? @"cancel_requested" : @"expiration_warning"];
            }
            [expTask setTaskCompletedWithSuccess:NO];
          };
        }];

        if (registered) {
          @synchronized (strongSelf) {
            if (strongSelf.sessionGeneration == generation) {
              strongSelf.activeContinuedTaskIdentifier = identifier;
            }
          }
          BGContinuedProcessingTaskRequest *request =
            [[BGContinuedProcessingTaskRequest alloc] initWithIdentifier:identifier
                                                                   title:title
                                                                subtitle:subtitle];
          request.strategy = BGContinuedProcessingTaskRequestSubmissionStrategyFail;
          request.requiredResources = BGContinuedProcessingTaskRequestResourcesDefault;

          void (^finishSubmission)(NSError * _Nullable) = ^(NSError * _Nullable submitError) {
            if (submitError == nil) {
              resolve(@{
                @"active": @YES,
                @"supportsContinuedBackground": @YES,
                @"mode": @"ios_continued_processing"
              });
              return;
            }
            @synchronized (strongSelf) {
              if ([strongSelf.activeContinuedTaskIdentifier isEqualToString:identifier]) {
                strongSelf.activeContinuedTaskIdentifier = nil;
              }
            }
            resolve(@{
              @"active": @(hasTier1),
              @"supportsContinuedBackground": @NO,
              @"mode": hasTier1 ? @"ios_background_task" : @"none"
            });
          };

#if defined(__IPHONE_27_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_27_0
          if (@available(iOS 27.0, *)) {
            [[BGTaskScheduler sharedScheduler] submitTaskRequest:request
                                               completionHandler:finishSubmission];
            return;
          }
#endif
          #pragma clang diagnostic push
          #pragma clang diagnostic ignored "-Wdeprecated-declarations"
          NSError *submitError = nil;
          BOOL submitted = [[BGTaskScheduler sharedScheduler] submitTaskRequest:request error:&submitError];
          #pragma clang diagnostic pop
          finishSubmission(submitted ? nil : (submitError ?: [NSError errorWithDomain:@"ChessticizeBackgroundBatchAnalysis" code:1 userInfo:nil]));
          return;
        }
      }
    }
#endif

    resolve(@{
      @"active": @(hasTier1),
      @"supportsContinuedBackground": @NO,
      @"mode": hasTier1 ? @"ios_background_task" : @"none"
    });
  });
}

RCT_EXPORT_METHOD(updateProgress:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *title = [input[@"title"] isKindOfClass:[NSString class]] && ((NSString *)input[@"title"]).length > 0
    ? input[@"title"]
    : @"Chessticize";
  NSString *subtitle = [input[@"subtitle"] isKindOfClass:[NSString class]] ? input[@"subtitle"] : @"";
  NSInteger completedUnits = [input[@"completedUnits"] isKindOfClass:[NSNumber class]]
    ? MAX(0, [input[@"completedUnits"] integerValue])
    : 0;
  NSInteger totalUnits = [input[@"totalUnits"] isKindOfClass:[NSNumber class]]
    ? MAX(1, [input[@"totalUnits"] integerValue])
    : 1;

  id continuedTask = nil;
  @synchronized (self) {
    self.latestTitle = title;
    self.latestSubtitle = subtitle;
    self.latestCompletedUnits = completedUnits;
    self.latestTotalUnits = totalUnits;
    if (self.activeContinuedTask != nil && !self.continuedTaskCompleted) {
      continuedTask = self.activeContinuedTask;
    }
  }

#if defined(__IPHONE_26_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0
  if (@available(iOS 26.0, *)) {
    if ([continuedTask isKindOfClass:[BGContinuedProcessingTask class]]) {
      BGContinuedProcessingTask *task = (BGContinuedProcessingTask *)continuedTask;
      task.progress.totalUnitCount = totalUnits;
      task.progress.completedUnitCount = MIN(completedUnits, totalUnits);
      [task updateTitle:title subtitle:subtitle];
    }
  }
#endif

  resolve(nil);
}

RCT_EXPORT_METHOD(finish:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self stopSessionWithSuccess:YES];

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
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self stopSessionWithSuccess:NO];
  resolve(nil);
}

@end
