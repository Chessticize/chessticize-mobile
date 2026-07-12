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
  BOOL storeAssetCapture = [self hasProcessArgumentNamed:@"chessticizeStoreAssetCapture"];
  if (testNowMs == nil && !storeAssetCapture) {
    return @{};
  }
  NSMutableDictionary *constants = [NSMutableDictionary dictionary];
  if (testNowMs != nil) {
    constants[@"testNowMs"] = testNowMs;
  }
  if (storeAssetCapture) {
    constants[@"storeAssetCapture"] = @YES;
  }
  return constants;
}

- (BOOL)hasProcessArgumentNamed:(NSString *)name
{
  NSString *dashedName = [@"-" stringByAppendingString:name];
  NSString *plainPrefix = [name stringByAppendingString:@"="];
  NSString *dashedPrefix = [dashedName stringByAppendingString:@"="];
  for (NSString *argument in NSProcessInfo.processInfo.arguments) {
    if ([argument isEqualToString:name] || [argument isEqualToString:dashedName]) {
      return YES;
    }
    if ([argument hasPrefix:plainPrefix] || [argument hasPrefix:dashedPrefix]) {
      return YES;
    }
  }
  return NO;
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
