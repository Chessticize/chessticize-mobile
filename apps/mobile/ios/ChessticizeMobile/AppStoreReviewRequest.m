#import <React/RCTBridgeModule.h>
#import <StoreKit/StoreKit.h>
#import <UIKit/UIKit.h>

@interface AppStoreReviewRequest : NSObject <RCTBridgeModule>
@end

@implementation AppStoreReviewRequest

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(requestReview:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (@available(iOS 14.0, *)) {
      UIWindowScene *windowScene = [self foregroundActiveWindowScene];
      if (windowScene != nil) {
        [SKStoreReviewController requestReviewInScene:windowScene];
        resolve(@YES);
      } else {
        resolve(@NO);
      }
    } else {
      [SKStoreReviewController requestReview];
      resolve(@YES);
    }
  });
}

- (nullable UIWindowScene *)foregroundActiveWindowScene API_AVAILABLE(ios(13.0))
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (scene.activationState == UISceneActivationStateForegroundActive
        && [scene isKindOfClass:UIWindowScene.class]) {
      return (UIWindowScene *)scene;
    }
  }
  return nil;
}

@end
