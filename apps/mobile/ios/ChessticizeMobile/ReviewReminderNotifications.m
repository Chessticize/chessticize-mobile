#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UserNotifications/UserNotifications.h>

static NSString * const ChessticizeReviewReminderIdentifier = @"chessticize.reviewReminder.next";

@interface ReviewReminderNotifications : NSObject <RCTBridgeModule>
@end

@implementation ReviewReminderNotifications

RCT_EXPORT_MODULE();

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
