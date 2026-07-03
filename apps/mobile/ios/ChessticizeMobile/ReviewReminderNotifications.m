#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>

static NSString * const ChessticizeReviewReminderIdentifier = @"chessticize.reviewReminder.next";
static NSString * const ChessticizeReviewReminderRouteEvent = @"ReviewReminderNotificationRoute";

@interface ReviewReminderNotifications : RCTEventEmitter <RCTBridgeModule, UNUserNotificationCenterDelegate>
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, copy, nullable) NSString *pendingRoute;
@end

@implementation ReviewReminderNotifications

RCT_EXPORT_MODULE();

- (instancetype)init
{
  self = [super init];
  if (self) {
    [UNUserNotificationCenter currentNotificationCenter].delegate = self;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ChessticizeReviewReminderRouteEvent];
}

- (void)startObserving
{
  self.hasListeners = YES;
}

- (void)stopObserving
{
  self.hasListeners = NO;
}

RCT_EXPORT_METHOD(replaceNextReminder:(NSDictionary *)reminder
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center removePendingNotificationRequestsWithIdentifiers:@[ChessticizeReviewReminderIdentifier]];

  if (reminder == nil || (id)reminder == [NSNull null]) {
    resolve(@{@"scheduled": @NO});
    return;
  }

  NSString *scheduledAt = [reminder[@"scheduledAt"] isKindOfClass:[NSString class]] ? reminder[@"scheduledAt"] : nil;
  NSString *body = [reminder[@"body"] isKindOfClass:[NSString class]] ? reminder[@"body"] : nil;
  NSString *route = [reminder[@"route"] isKindOfClass:[NSString class]] ? reminder[@"route"] : @"review";
  NSNumber *dueCount = [reminder[@"dueCount"] isKindOfClass:[NSNumber class]] ? reminder[@"dueCount"] : @0;

  NSDate *scheduledDate = [self dateFromISOString:scheduledAt];
  if (scheduledDate == nil || body == nil || body.length == 0) {
    reject(@"invalid_reminder", @"Reminder payload must include a valid scheduledAt and body.", nil);
    return;
  }

  NSDateComponents *components = [[NSCalendar currentCalendar] components:NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay | NSCalendarUnitHour | NSCalendarUnitMinute fromDate:scheduledDate];
  UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
  content.title = @"Chessticize";
  content.body = body;
  content.sound = [UNNotificationSound defaultSound];
  content.userInfo = @{
    @"route": route,
    @"dueCount": dueCount
  };

  UNCalendarNotificationTrigger *trigger = [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:NO];
  UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:ChessticizeReviewReminderIdentifier content:content trigger:trigger];
  [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
    if (error != nil) {
      reject(@"schedule_failed", error.localizedDescription, error);
      return;
    }
    resolve(@{@"scheduled": @YES, @"scheduledAt": scheduledAt});
  }];
}

RCT_EXPORT_METHOD(getAuthorizationStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [[UNUserNotificationCenter currentNotificationCenter] getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    resolve([self stringFromAuthorizationStatus:settings.authorizationStatus]);
  }];
}

RCT_EXPORT_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNAuthorizationOptions options = UNAuthorizationOptionAlert | UNAuthorizationOptionBadge | UNAuthorizationOptionSound;
  [[UNUserNotificationCenter currentNotificationCenter] requestAuthorizationWithOptions:options completionHandler:^(BOOL granted, NSError *error) {
    if (error != nil) {
      reject(@"permission_failed", error.localizedDescription, error);
      return;
    }
    [[UNUserNotificationCenter currentNotificationCenter] getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      resolve([self stringFromAuthorizationStatus:settings.authorizationStatus]);
    }];
  }];
}

RCT_EXPORT_METHOD(openSystemSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *settingsURL = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    UIApplication *application = [UIApplication sharedApplication];
    if (settingsURL == nil || ![application canOpenURL:settingsURL]) {
      resolve(nil);
      return;
    }
    [application openURL:settingsURL options:@{} completionHandler:^(__unused BOOL success) {
      resolve(nil);
    }];
  });
}

RCT_EXPORT_METHOD(consumeInitialRoute:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *route = self.pendingRoute;
  self.pendingRoute = nil;
  resolve(route);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
  NSString *route = [response.notification.request.content.userInfo[@"route"] isKindOfClass:[NSString class]]
    ? response.notification.request.content.userInfo[@"route"]
    : nil;
  if ([route isEqualToString:@"review"]) {
    [self publishRoute:route];
  }
  completionHandler();
}

- (void)publishRoute:(NSString *)route
{
  if (self.hasListeners) {
    [self sendEventWithName:ChessticizeReviewReminderRouteEvent body:route];
    return;
  }
  self.pendingRoute = route;
}

- (NSString *)stringFromAuthorizationStatus:(UNAuthorizationStatus)status
{
  switch (status) {
    case UNAuthorizationStatusNotDetermined:
      return @"not_determined";
    case UNAuthorizationStatusDenied:
      return @"denied";
    case UNAuthorizationStatusAuthorized:
    case UNAuthorizationStatusProvisional:
    case UNAuthorizationStatusEphemeral:
      return @"authorized";
  }
}

- (NSDate *)dateFromISOString:(NSString *)value
{
  if (value == nil) {
    return nil;
  }

  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  NSDate *date = [formatter dateFromString:value];
  if (date != nil) {
    return date;
  }

  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
  return [formatter dateFromString:value];
}

@end
