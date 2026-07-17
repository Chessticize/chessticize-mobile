#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface ApplicationMetadata : NSObject <RCTBridgeModule>
@end

@implementation ApplicationMetadata

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *versionName = [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  NSString *buildNumber = [bundle objectForInfoDictionaryKey:@"CFBundleVersion"];
  NSAssert(versionName.length > 0, @"CFBundleShortVersionString must be present in the installed artifact");
  NSAssert(buildNumber.length > 0, @"CFBundleVersion must be present in the installed artifact");
  return @{
    @"versionName": versionName,
    @"buildNumber": buildNumber,
  };
}

@end
