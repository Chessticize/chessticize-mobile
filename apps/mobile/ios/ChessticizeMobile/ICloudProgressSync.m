#import <CloudKit/CloudKit.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static NSString * const ChessticizeProgressRecordType = @"ProgressSnapshot";
static NSString * const ChessticizeProgressRecordName = @"default";
static NSString * const ChessticizeProgressPayloadField = @"payload";
static NSString * const ChessticizeProgressSchemaVersionField = @"schemaVersion";
static NSString * const ChessticizeProgressUpdatedAtField = @"updatedAt";

@interface ICloudProgressSync : NSObject <RCTBridgeModule>
@end

@implementation ICloudProgressSync

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getAccountStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [[CKContainer defaultContainer] accountStatusWithCompletionHandler:^(CKAccountStatus accountStatus, NSError *error) {
    if (error != nil) {
      resolve(@"could_not_determine");
      return;
    }
    resolve([self stringFromAccountStatus:accountStatus]);
  }];
}

RCT_EXPORT_METHOD(fetchSnapshot:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:ChessticizeProgressRecordName];
  [[self privateDatabase] fetchRecordWithID:recordID completionHandler:^(CKRecord *record, NSError *error) {
    if (error != nil) {
      if ([self isUnknownItemError:error]) {
        resolve((id)nil);
        return;
      }
      reject(@"icloud_fetch_failed", error.localizedDescription, error);
      return;
    }
    if (record == nil) {
      resolve((id)nil);
      return;
    }

    NSError *payloadError = nil;
    NSString *payload = [self payloadStringFromRecord:record error:&payloadError];
    if (payloadError != nil) {
      reject(@"icloud_payload_invalid", payloadError.localizedDescription, payloadError);
      return;
    }
    resolve(@{
      @"payload": payload ?: @"",
      @"changeTag": record.recordChangeTag ?: [NSNull null]
    });
  }];
}

RCT_EXPORT_METHOD(saveSnapshot:(NSString *)payload
                  expectedChangeTag:(NSString *)expectedChangeTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![payload isKindOfClass:[NSString class]] || payload.length == 0) {
    reject(@"icloud_payload_invalid", @"Snapshot payload must be a non-empty JSON string.", nil);
    return;
  }

  CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:ChessticizeProgressRecordName];
  [[self privateDatabase] fetchRecordWithID:recordID completionHandler:^(CKRecord *record, NSError *fetchError) {
    BOOL recordDoesNotExist = fetchError != nil && [self isUnknownItemError:fetchError];
    if (fetchError != nil && !recordDoesNotExist) {
      reject(@"icloud_fetch_failed", fetchError.localizedDescription, fetchError);
      return;
    }
    if (recordDoesNotExist && expectedChangeTag != nil) {
      reject(@"icloud_save_conflict", @"The iCloud progress snapshot was deleted during sync.", fetchError);
      return;
    }
    if (record != nil && (expectedChangeTag == nil || ![record.recordChangeTag isEqualToString:expectedChangeTag])) {
      reject(@"icloud_save_conflict", @"The iCloud progress snapshot changed during sync.", nil);
      return;
    }

    CKRecord *targetRecord = record ?: [[CKRecord alloc] initWithRecordType:ChessticizeProgressRecordType recordID:recordID];
    [self saveRecord:targetRecord payload:payload resolver:resolve rejecter:reject];
  }];
}

- (CKDatabase *)privateDatabase
{
  return [[CKContainer defaultContainer] privateCloudDatabase];
}

- (void)saveRecord:(CKRecord *)record
           payload:(NSString *)payload
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject
{
  NSError *writeError = nil;
  NSURL *payloadURL = [self writeTemporaryPayload:payload error:&writeError];
  if (writeError != nil || payloadURL == nil) {
    reject(@"icloud_payload_write_failed", writeError.localizedDescription, writeError);
    return;
  }

  record[ChessticizeProgressPayloadField] = [[CKAsset alloc] initWithFileURL:payloadURL];
  record[ChessticizeProgressSchemaVersionField] = @1;
  record[ChessticizeProgressUpdatedAtField] = [NSDate date];

  [[self privateDatabase] saveRecord:record completionHandler:^(CKRecord *savedRecord, NSError *saveError) {
    [[NSFileManager defaultManager] removeItemAtURL:payloadURL error:nil];
    if (saveError != nil) {
      if ([saveError.domain isEqualToString:CKErrorDomain] && saveError.code == CKErrorServerRecordChanged) {
        reject(@"icloud_save_conflict", @"The iCloud progress snapshot changed during save.", saveError);
        return;
      }
      reject(@"icloud_save_failed", saveError.localizedDescription, saveError);
      return;
    }
    resolve(@{
      @"saved": @YES,
      @"changeTag": savedRecord.recordChangeTag ?: [NSNull null]
    });
  }];
}

- (NSURL *)writeTemporaryPayload:(NSString *)payload error:(NSError **)error
{
  NSString *filename = [NSString stringWithFormat:@"chessticize-progress-%@.json", [NSUUID UUID].UUIDString];
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:filename];
  NSURL *url = [NSURL fileURLWithPath:path];
  BOOL wrote = [payload writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:error];
  return wrote ? url : nil;
}

- (NSString *)payloadStringFromRecord:(CKRecord *)record error:(NSError **)error
{
  id value = record[ChessticizeProgressPayloadField];
  if ([value isKindOfClass:[CKAsset class]]) {
    NSURL *fileURL = ((CKAsset *)value).fileURL;
    if (fileURL == nil) {
      if (error != nil) {
        *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                     code:1
                                 userInfo:@{NSLocalizedDescriptionKey: @"CloudKit payload asset is missing a file URL."}];
      }
      return nil;
    }
    return [NSString stringWithContentsOfURL:fileURL encoding:NSUTF8StringEncoding error:error];
  }
  if ([value isKindOfClass:[NSString class]]) {
    return value;
  }
  if (value == nil) {
    return nil;
  }
  if (error != nil) {
    *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                 code:2
                             userInfo:@{NSLocalizedDescriptionKey: @"CloudKit payload field must be an asset or string."}];
  }
  return nil;
}

- (BOOL)isUnknownItemError:(NSError *)error
{
  return [error.domain isEqualToString:CKErrorDomain] && error.code == CKErrorUnknownItem;
}

- (NSString *)stringFromAccountStatus:(CKAccountStatus)status
{
  switch (status) {
    case CKAccountStatusAvailable:
      return @"available";
    case CKAccountStatusNoAccount:
      return @"no_account";
    case CKAccountStatusRestricted:
      return @"restricted";
    case CKAccountStatusCouldNotDetermine:
      return @"could_not_determine";
    default:
      return @"unavailable";
  }
}

@end
