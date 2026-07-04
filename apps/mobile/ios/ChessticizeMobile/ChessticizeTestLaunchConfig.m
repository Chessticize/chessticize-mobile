#import <React/RCTBridgeModule.h>

@interface ChessticizeTestLaunchConfig : NSObject <RCTBridgeModule>
@end

@implementation ChessticizeTestLaunchConfig

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  NSString *testNowMs = [self testNowMsFromProcessArguments];
  if (testNowMs == nil) {
    return @{};
  }
  return @{@"testNowMs": testNowMs};
}

- (NSString *)testNowMsFromProcessArguments
{
  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
  for (NSUInteger index = 0; index < arguments.count; index++) {
    NSString *argument = arguments[index];
    if ([argument isEqualToString:@"-chessticizeTestNowMs"] || [argument isEqualToString:@"chessticizeTestNowMs"]) {
      NSUInteger valueIndex = index + 1;
      if (valueIndex < arguments.count) {
        return arguments[valueIndex];
      }
    }
    NSString *prefixedKey = @"-chessticizeTestNowMs=";
    if ([argument hasPrefix:prefixedKey]) {
      return [argument substringFromIndex:prefixedKey.length];
    }
    NSString *plainKey = @"chessticizeTestNowMs=";
    if ([argument hasPrefix:plainKey]) {
      return [argument substringFromIndex:plainKey.length];
    }
  }
  return nil;
}

@end
