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
@property (nonatomic, assign) BOOL pausedForLock;
@property (nonatomic, copy) NSString *latestTitle;
@property (nonatomic, copy) NSString *latestSubtitle;
@property (nonatomic, copy) NSString *pausedSubtitle;
@property (nonatomic, assign) NSInteger latestCompletedUnits;
@property (nonatomic, assign) NSInteger latestTotalUnits;
@property (nonatomic, strong, nullable) id protectedDataWillLockObserver;
@property (nonatomic, strong, nullable) id protectedDataDidUnlockObserver;
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
    _pausedSubtitle = @"Paused while locked";
    _latestCompletedUnits = 0;
    _latestTotalUnits = 1;
    _pausedForLock = NO;

    __weak typeof(self) weakSelf = self;
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    _protectedDataWillLockObserver = [center
      addObserverForName:UIApplicationProtectedDataWillBecomeUnavailable
                  object:nil
                   queue:[NSOperationQueue mainQueue]
              usingBlock:^(__unused NSNotification *note) {
                __strong typeof(weakSelf) strongSelf = weakSelf;
                [strongSelf handleDeviceWillLock];
              }];
    _protectedDataDidUnlockObserver = [center
      addObserverForName:UIApplicationProtectedDataDidBecomeAvailable
                  object:nil
                   queue:[NSOperationQueue mainQueue]
              usingBlock:^(__unused NSNotification *note) {
                __strong typeof(weakSelf) strongSelf = weakSelf;
                [strongSelf handleDeviceDidUnlock];
              }];
  }
  return self;
}

- (void)dealloc
{
  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  if (_protectedDataWillLockObserver != nil) {
    [center removeObserver:_protectedDataWillLockObserver];
    _protectedDataWillLockObserver = nil;
  }
  if (_protectedDataDidUnlockObserver != nil) {
    [center removeObserver:_protectedDataDidUnlockObserver];
    _protectedDataDidUnlockObserver = nil;
  }
  [self stopSessionWithSuccess:YES];
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

/**
 * Pauses active Stockfish/CoreML work when the device locks while keeping BGContinuedProcessingTask
 * alive (NOT completed/Done) so unlocking the phone immediately resumes analysis even if the user
 * stays on the Home Screen or in another app.
 *
 * Updates the Live Activity subtitle to "Paused while locked" so the Lock Screen shows Paused
 * rather than "Done" or "Task failed". If iOS eventually reclaims the task during a long lock,
 * expirationHandler cleanly finalizes it and JS auto-resumes upon returning to the app.
 */
- (void)handleDeviceWillLock
{
  id continuedTask = nil;
  NSString *title = @"Chessticize";
  NSString *pausedSub = @"Paused while locked";
  BOOL hasContinuedSession = NO;
  BOOL hasTier1Only = NO;

  @synchronized (self) {
    if (self.activeContinuedTask != nil && !self.continuedTaskCompleted) {
      continuedTask = self.activeContinuedTask;
      self.pausedForLock = YES;
      hasContinuedSession = YES;
      title = self.latestTitle;
      pausedSub = self.pausedSubtitle;
    } else if (self.activeContinuedTaskIdentifier.length > 0) {
      self.pausedForLock = YES;
      hasContinuedSession = YES;
    } else if (self.backgroundTaskID != UIBackgroundTaskInvalid) {
      hasTier1Only = YES;
    }
  }

#if defined(__IPHONE_26_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0
  if (@available(iOS 26.0, *)) {
    if ([continuedTask isKindOfClass:[BGContinuedProcessingTask class]]) {
      [(BGContinuedProcessingTask *)continuedTask updateTitle:title subtitle:pausedSub];
    }
  }
#endif

  if (hasContinuedSession) {
    [self emitBridgeEvent:@"lock_paused"];
  } else if (hasTier1Only) {
    [self emitBridgeEvent:@"expiration_warning"];
  }
}

/**
 * Automatically resumes a lock-paused BGContinuedProcessingTask as soon as the device unlocks,
 * even if Chessticize remains in the background.
 */
- (void)handleDeviceDidUnlock
{
  id continuedTask = nil;
  NSString *title = @"Chessticize";
  NSString *subtitle = @"";
  BOOL shouldResume = NO;

  @synchronized (self) {
    if (self.pausedForLock) {
      self.pausedForLock = NO;
      if (self.activeContinuedTask != nil && !self.continuedTaskCompleted) {
        continuedTask = self.activeContinuedTask;
        title = self.latestTitle;
        subtitle = self.latestSubtitle;
        shouldResume = YES;
      } else if (self.activeContinuedTaskIdentifier.length > 0) {
        shouldResume = YES;
      }
    }
  }

#if defined(__IPHONE_26_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0
  if (@available(iOS 26.0, *)) {
    if ([continuedTask isKindOfClass:[BGContinuedProcessingTask class]]) {
      [(BGContinuedProcessingTask *)continuedTask updateTitle:title subtitle:subtitle];
    }
  }
#endif

  if (shouldResume) {
    [self emitBridgeEvent:@"unlock_resumed"];
  }
}

- (void)stopSessionWithSuccess:(BOOL)success
{
  id continuedTaskToFinish = nil;
  NSString *pendingIdentifierToCancel = nil;
  @synchronized (self) {
    self.sessionGeneration += 1;
    self.pausedForLock = NO;
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
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self stopSessionWithSuccess:YES];

  NSString *title = [input[@"title"] isKindOfClass:[NSString class]] && ((NSString *)input[@"title"]).length > 0
    ? input[@"title"]
    : @"Chessticize";
  NSString *subtitle = [input[@"subtitle"] isKindOfClass:[NSString class]] ? input[@"subtitle"] : @"";
  NSString *pausedSub = [input[@"pausedSubtitle"] isKindOfClass:[NSString class]] && ((NSString *)input[@"pausedSubtitle"]).length > 0
    ? input[@"pausedSubtitle"]
    : @"Paused while locked";
  NSInteger totalUnits = [input[@"totalUnits"] isKindOfClass:[NSNumber class]]
    ? MAX(1, [input[@"totalUnits"] integerValue])
    : 1;

  NSUInteger generation = 0;
  @synchronized (self) {
    self.sessionGeneration += 1;
    generation = self.sessionGeneration;
    self.latestTitle = title;
    self.latestSubtitle = subtitle;
    self.pausedSubtitle = pausedSub;
    self.latestCompletedUnits = 0;
    self.latestTotalUnits = totalUnits;
    self.continuedTaskCompleted = NO;
    self.pausedForLock = NO;
  }

  __weak typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) {
      resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
      return;
    }

    // Never start a background session while already backgrounded with the device locked.
    UIApplication *app = [UIApplication sharedApplication];
    if (!app.isProtectedDataAvailable && app.applicationState == UIApplicationStateBackground) {
      resolve(@{ @"active": @NO, @"supportsContinuedBackground": @NO, @"mode": @"none" });
      return;
    }

    // Tier 1 (iOS 15.1+): Graceful background runway for app-switching and SQLite checkpoint
    // flushing if the device locks or iOS reclaims background time.
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
    // Tier 2 (iOS 26+): System-managed BGContinuedProcessingTask so switching to another app
    // continues analyzing smoothly with Dynamic Island / Live Activity progress. Locking the
    // screen pauses work in-place (updating subtitle to Paused) and unlocking resumes immediately.
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
            [bgTask setTaskCompletedWithSuccess:YES];
            return;
          }
          BGContinuedProcessingTask *continuedTask = (BGContinuedProcessingTask *)bgTask;
          NSString *initialTitle = @"Chessticize";
          NSString *initialSubtitle = @"";
          NSInteger initialCompleted = 0;
          NSInteger initialTotal = 1;
          @synchronized (handlerSelf) {
            if (handlerSelf.sessionGeneration != generation ||
                handlerSelf.activeContinuedTaskIdentifier == nil ||
                ![handlerSelf.activeContinuedTaskIdentifier isEqualToString:identifier]) {
              [continuedTask setTaskCompletedWithSuccess:YES];
              return;
            }
            handlerSelf.activeContinuedTask = continuedTask;
            handlerSelf.continuedTaskCompleted = NO;
            initialTitle = handlerSelf.latestTitle;
            initialSubtitle = handlerSelf.pausedForLock ? handlerSelf.pausedSubtitle : handlerSelf.latestSubtitle;
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
              [expTask setTaskCompletedWithSuccess:YES];
              return;
            }
            BOOL wasUserCancelled = expTask != nil && expTask.progress.isCancelled;
            BOOL shouldEmit = NO;
            @synchronized (expSelf) {
              if (expSelf.sessionGeneration == generation && !expSelf.continuedTaskCompleted) {
                expSelf.continuedTaskCompleted = YES;
                expSelf.pausedForLock = NO;
                expSelf.activeContinuedTask = nil;
                expSelf.activeContinuedTaskIdentifier = nil;
                shouldEmit = YES;
              }
            }
            if (shouldEmit) {
              [expSelf emitBridgeEvent:wasUserCancelled ? @"cancel_requested" : @"expiration_warning"];
            }
            [expTask setTaskCompletedWithSuccess:wasUserCancelled ? NO : YES];
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
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
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
  NSString *effectiveSubtitle = subtitle;
  @synchronized (self) {
    self.latestTitle = title;
    self.latestSubtitle = subtitle;
    self.latestCompletedUnits = completedUnits;
    self.latestTotalUnits = totalUnits;
    if (self.activeContinuedTask != nil && !self.continuedTaskCompleted) {
      continuedTask = self.activeContinuedTask;
      if (self.pausedForLock) {
        effectiveSubtitle = self.pausedSubtitle;
      }
    }
  }

#if defined(__IPHONE_26_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0
  if (@available(iOS 26.0, *)) {
    if ([continuedTask isKindOfClass:[BGContinuedProcessingTask class]]) {
      BGContinuedProcessingTask *task = (BGContinuedProcessingTask *)continuedTask;
      task.progress.totalUnitCount = totalUnits;
      task.progress.completedUnitCount = MIN(completedUnits, totalUnits);
      [task updateTitle:title subtitle:effectiveSubtitle];
    }
  }
#endif

  resolve(nil);
}

RCT_EXPORT_METHOD(finish:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
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
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self stopSessionWithSuccess:YES];
  resolve(nil);
}

@end
