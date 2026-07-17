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
  NSString *testNowMs = [self processArgumentValueForName:@"chessticizeTestNowMs"];
  NSString *puzzleSelectionSeed = [self processArgumentValueForName:@"chessticizePuzzleSelectionSeed"];
  BOOL storeAssetCapture = [self hasProcessArgumentNamed:@"chessticizeStoreAssetCapture"];
  if (testNowMs == nil && puzzleSelectionSeed == nil && !storeAssetCapture) {
    return @{};
  }
  NSMutableDictionary *constants = [NSMutableDictionary dictionary];
  if (testNowMs != nil) {
    constants[@"testNowMs"] = testNowMs;
  }
  if (puzzleSelectionSeed != nil) {
    constants[@"puzzleSelectionSeed"] = puzzleSelectionSeed;
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

- (NSString *)processArgumentValueForName:(NSString *)name
{
  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
  NSString *dashedName = [@"-" stringByAppendingString:name];
  NSString *plainPrefix = [name stringByAppendingString:@"="];
  NSString *dashedPrefix = [dashedName stringByAppendingString:@"="];
  for (NSUInteger index = 0; index < arguments.count; index++) {
    NSString *argument = arguments[index];
    if ([argument isEqualToString:name] || [argument isEqualToString:dashedName]) {
      NSUInteger valueIndex = index + 1;
      if (valueIndex < arguments.count) {
        return arguments[valueIndex];
      }
    }
    if ([argument hasPrefix:dashedPrefix]) {
      return [argument substringFromIndex:dashedPrefix.length];
    }
    if ([argument hasPrefix:plainPrefix]) {
      return [argument substringFromIndex:plainPrefix.length];
    }
  }
  return nil;
}

@end
