#import <CloudKit/CloudKit.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static NSString * const ChessticizeV1RecordType = @"ProgressSnapshot";
static NSString * const ChessticizeV1RecordName = @"default";
static NSString * const ChessticizeV1PayloadField = @"payload";
static NSString * const ChessticizeV1SchemaVersionField = @"schemaVersion";
static NSString * const ChessticizeV1UpdatedAtField = @"updatedAt";

static NSString * const ChessticizeV2ZoneName = @"ProgressV2";
static NSString * const ChessticizeV2RecordType = @"ProgressV2Record";
static NSString * const ChessticizeV2KindField = @"kind";
static NSString * const ChessticizeV2SchemaVersionField = @"schemaVersion";
static NSString * const ChessticizeV2PayloadField = @"payload";
static NSString * const ChessticizeV2CapturePrefix = @"chessticize-progress-v2-capture-";
static NSUInteger const ChessticizeV2CaptureMaximumRecords = 250000;
static unsigned long long const ChessticizeV2CaptureMaximumBytes = 256ULL * 1024ULL * 1024ULL;
static NSTimeInterval const ChessticizeV2CaptureTimeoutSeconds = 120.0;

@interface ICloudProgressSync : NSObject <RCTBridgeModule>
@end

@implementation ICloudProgressSync

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getAccountStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if ([[self processArgumentValueForName:@"chessticizeICloudDiagnosticsFixture"]
        isEqualToString:@"unavailable"]) {
    resolve(@"could_not_determine");
    return;
  }
  [[CKContainer defaultContainer] accountStatusWithCompletionHandler:^(CKAccountStatus accountStatus, NSError *error) {
    if (error != nil) {
      resolve(@"could_not_determine");
      return;
    }
    resolve([self stringFromAccountStatus:accountStatus]);
  }];
}

- (NSString *)processArgumentValueForName:(NSString *)name
{
  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
  NSString *dashedName = [@"-" stringByAppendingString:name];
  NSString *plainPrefix = [name stringByAppendingString:@"="];
  NSString *dashedPrefix = [dashedName stringByAppendingString:@"="];
  for (NSUInteger index = 0; index < arguments.count; index += 1) {
    NSString *argument = arguments[index];
    if ([argument isEqualToString:name] || [argument isEqualToString:dashedName]) {
      NSUInteger valueIndex = index + 1;
      return valueIndex < arguments.count ? arguments[valueIndex] : nil;
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

RCT_EXPORT_METHOD(ensureV2Zone:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  CKRecordZoneID *zoneID = [self progressV2ZoneID];
  [[self privateDatabase] fetchRecordZoneWithID:zoneID completionHandler:^(CKRecordZone *zone, NSError *error) {
    if (zone != nil && error == nil) {
      resolve(@{ @"created": @NO });
      return;
    }
    if (error != nil && ![self isZoneMissingError:error]) {
      reject(@"icloud_v2_zone_fetch_failed",
             @"CloudKit could not inspect the Progress V2 zone.",
             [self diagnosticError:error]);
      return;
    }
    CKRecordZone *newZone = [[CKRecordZone alloc] initWithZoneID:zoneID];
    [[self privateDatabase] saveRecordZone:newZone completionHandler:^(CKRecordZone *savedZone, NSError *saveError) {
      if (saveError != nil) {
        reject(@"icloud_v2_zone_create_failed",
               @"CloudKit could not create the Progress V2 zone.",
               [self diagnosticError:saveError]);
        return;
      }
      resolve(@{ @"created": @YES });
    }];
  }];
}

RCT_EXPORT_METHOD(fetchV2Changes:(NSString *)previousTokenBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *tokenError = nil;
  CKServerChangeToken *previousToken = [self changeTokenFromBase64:previousTokenBase64 error:&tokenError];
  if (tokenError != nil) {
    reject(@"icloud_change_token_invalid",
           @"The local Progress V2 change token is invalid.",
           [self diagnosticError:tokenError]);
    return;
  }

  CKRecordZoneID *zoneID = [self progressV2ZoneID];
  CKFetchRecordZoneChangesConfiguration *configuration = [CKFetchRecordZoneChangesConfiguration new];
  configuration.previousServerChangeToken = previousToken;
  configuration.desiredKeys = @[
    ChessticizeV2KindField,
    ChessticizeV2SchemaVersionField,
    ChessticizeV2PayloadField
  ];
  CKFetchRecordZoneChangesOperation *operation =
    [[CKFetchRecordZoneChangesOperation alloc]
      initWithRecordZoneIDs:@[zoneID]
      configurationsByRecordZoneID:@{zoneID: configuration}];
  operation.fetchAllChanges = YES;
  operation.qualityOfService = NSQualityOfServiceUtility;

  NSMutableArray<NSDictionary *> *records = [NSMutableArray array];
  NSMutableArray<NSDictionary *> *deletedRecords = [NSMutableArray array];
  __block NSError *recordError = nil;
  __block BOOL finished = NO;

  operation.recordWasChangedBlock = ^(CKRecordID *recordID,
                                      CKRecord *record,
                                      NSError *fetchError) {
    if (recordError != nil) {
      return;
    }
    if (fetchError != nil || record == nil) {
      recordError = fetchError ?: [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                                      code:9
                                                  userInfo:@{NSLocalizedDescriptionKey: @"CloudKit could not return a changed V2 record."}];
      return;
    }
    NSError *decodeError = nil;
    NSDictionary *encoded = [self dictionaryFromV2Record:record error:&decodeError];
    if (decodeError != nil || encoded == nil) {
      recordError = decodeError ?: [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                                        code:10
                                                    userInfo:@{NSLocalizedDescriptionKey: @"CloudKit returned an invalid V2 record."}];
      return;
    }
    [records addObject:encoded];
  };
  operation.recordWithIDWasDeletedBlock = ^(CKRecordID *recordID, CKRecordType recordType) {
    [deletedRecords addObject:@{ @"recordName": recordID.recordName ?: @"" }];
  };
  operation.recordZoneFetchCompletionBlock = ^(CKRecordZoneID *recordZoneID,
                                                CKServerChangeToken *serverChangeToken,
                                                NSData *clientChangeTokenData,
                                                BOOL moreComing,
                                                NSError *zoneError) {
    if (finished) {
      return;
    }
    finished = YES;
    NSError *effectiveError = recordError ?: zoneError;
    if (effectiveError != nil) {
      [self rejectZoneChangeError:effectiveError rejecter:reject];
      return;
    }
    NSError *archiveError = nil;
    NSString *nextToken = [self base64FromChangeToken:serverChangeToken error:&archiveError];
    if (archiveError != nil || nextToken == nil) {
      reject(@"icloud_change_token_archive_failed",
             @"CloudKit returned a Progress V2 token that could not be stored.",
             [self diagnosticError:archiveError]);
      return;
    }
    resolve(@{
      @"records": records,
      @"deletedRecords": deletedRecords,
      @"nextToken": nextToken,
      @"moreComing": @(moreComing)
    });
  };
  operation.fetchRecordZoneChangesCompletionBlock = ^(NSError *operationError) {
    if (!finished && operationError != nil) {
      finished = YES;
      [self rejectZoneChangeError:operationError rejecter:reject];
    }
  };
  [[self privateDatabase] addOperation:operation];
}

RCT_EXPORT_METHOD(captureV2ForSupport:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *startedAt = [self iso8601StringForDate:[NSDate date]];
  NSString *captureName = [NSString stringWithFormat:@"%@%@.ndjson",
                                                     ChessticizeV2CapturePrefix,
                                                     NSUUID.UUID.UUIDString];
  NSURL *captureURL = [NSURL fileURLWithPath:[NSTemporaryDirectory()
    stringByAppendingPathComponent:captureName]];
  if (![[NSFileManager defaultManager] createFileAtPath:captureURL.path
                                               contents:nil
                                             attributes:nil]) {
    reject(@"icloud_v2_capture_file_failed",
           @"The Progress V2 support capture file could not be created.",
           nil);
    return;
  }
  NSFileHandle *fileHandle = [NSFileHandle fileHandleForWritingAtPath:captureURL.path];
  if (fileHandle == nil) {
    [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
    reject(@"icloud_v2_capture_file_failed",
           @"The Progress V2 support capture file could not be opened.",
           nil);
    return;
  }

  CKRecordZoneID *zoneID = [self progressV2ZoneID];
  CKFetchRecordZoneChangesConfiguration *configuration = [CKFetchRecordZoneChangesConfiguration new];
  configuration.previousServerChangeToken = nil;
  configuration.desiredKeys = @[
    ChessticizeV2KindField,
    ChessticizeV2SchemaVersionField,
    ChessticizeV2PayloadField
  ];
  CKFetchRecordZoneChangesOperation *operation =
    [[CKFetchRecordZoneChangesOperation alloc]
      initWithRecordZoneIDs:@[zoneID]
      configurationsByRecordZoneID:@{zoneID: configuration}];
  operation.fetchAllChanges = YES;
  operation.qualityOfService = NSQualityOfServiceUtility;

  NSLock *captureLock = [NSLock new];
  NSMutableDictionary<NSString *, NSNumber *> *familyCounts = [NSMutableDictionary dictionary];
  __block NSUInteger recordCount = 0;
  __block NSUInteger deletionCount = 0;
  __block unsigned long long byteCount = 0;
  __block NSError *captureError = nil;
  __block BOOL finished = NO;

  operation.recordWasChangedBlock = ^(CKRecordID *recordID,
                                      CKRecord *record,
                                      NSError *fetchError) {
    NSError *recordError = fetchError;
    if (recordError == nil && record == nil) {
      recordError = [self captureErrorWithCode:49
                                       message:@"CloudKit could not return a changed Progress V2 record."];
    }
    NSDictionary *encoded = record == nil
      ? nil
      : [self dictionaryFromV2Record:record error:&recordError];
    NSMutableDictionary *envelope = encoded == nil ? nil : [encoded mutableCopy];
    envelope[@"changeType"] = @"record";
    envelope[@"recordType"] = record.recordType ?: ChessticizeV2RecordType;
    if (record.recordChangeTag.length > 0) {
      envelope[@"recordChangeTag"] = record.recordChangeTag;
    }
    if (record.modificationDate != nil) {
      envelope[@"modifiedAt"] = [self iso8601StringForDate:record.modificationDate];
    }
    NSData *line = envelope == nil
      ? nil
      : [self ndjsonLineForObject:envelope error:&recordError];

    [captureLock lock];
    if (!finished && captureError == nil) {
      if (recordError != nil || line == nil) {
        captureError = recordError ?: [self captureErrorWithCode:50
                                                         message:@"A Progress V2 record could not be encoded."];
      } else if (recordCount + deletionCount + 1 > ChessticizeV2CaptureMaximumRecords ||
                 byteCount + line.length > ChessticizeV2CaptureMaximumBytes) {
        captureError = [self captureErrorWithCode:51
                                          message:@"The Progress V2 support capture exceeded its safety limit."];
      } else {
        @try {
          [fileHandle writeData:line];
          recordCount += 1;
          byteCount += line.length;
          NSString *kind = encoded[@"kind"];
          familyCounts[kind] = @([familyCounts[kind] unsignedIntegerValue] + 1);
        } @catch (NSException *exception) {
          captureError = [self captureErrorWithCode:52
                                            message:@"The Progress V2 support capture could not be written."];
        }
      }
    }
    [captureLock unlock];
  };
  operation.recordWithIDWasDeletedBlock = ^(CKRecordID *recordID, CKRecordType recordType) {
    NSError *lineError = nil;
    NSData *line = [self ndjsonLineForObject:@{
      @"changeType": @"deleted",
      @"recordType": recordType ?: ChessticizeV2RecordType,
      @"recordName": recordID.recordName ?: @""
    } error:&lineError];
    [captureLock lock];
    if (!finished && captureError == nil) {
      if (lineError != nil || line == nil) {
        captureError = lineError ?: [self captureErrorWithCode:53
                                                       message:@"A Progress V2 deletion could not be encoded."];
      } else if (recordCount + deletionCount + 1 > ChessticizeV2CaptureMaximumRecords ||
                 byteCount + line.length > ChessticizeV2CaptureMaximumBytes) {
        captureError = [self captureErrorWithCode:51
                                          message:@"The Progress V2 support capture exceeded its safety limit."];
      } else {
        @try {
          [fileHandle writeData:line];
          deletionCount += 1;
          byteCount += line.length;
        } @catch (NSException *exception) {
          captureError = [self captureErrorWithCode:52
                                            message:@"The Progress V2 support capture could not be written."];
        }
      }
    }
    [captureLock unlock];
  };
  operation.recordZoneFetchCompletionBlock = ^(CKRecordZoneID *recordZoneID,
                                                CKServerChangeToken *serverChangeToken,
                                                NSData *clientChangeTokenData,
                                                BOOL moreComing,
                                                NSError *zoneError) {
    [captureLock lock];
    if (finished) {
      [captureLock unlock];
      return;
    }
    finished = YES;
    [fileHandle closeFile];
    NSError *effectiveError = captureError ?: zoneError;
    NSUInteger finalRecordCount = recordCount;
    NSUInteger finalDeletionCount = deletionCount;
    unsigned long long finalByteCount = byteCount;
    NSDictionary *finalFamilyCounts = [familyCounts copy];
    [captureLock unlock];

    NSString *completedAt = [self iso8601StringForDate:[NSDate date]];
    if (effectiveError != nil) {
      [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
      if ([self isZoneMissingError:effectiveError]) {
        resolve(@{
          @"status": @"not_initialized",
          @"recordCount": @0,
          @"deletionCount": @0,
          @"familyCounts": @{},
          @"bytes": @0,
          @"startedAt": startedAt,
          @"completedAt": completedAt
        });
        return;
      }
      reject(@"icloud_v2_capture_failed",
             @"CloudKit could not capture Progress V2 support data.",
             [self diagnosticError:effectiveError]);
      return;
    }
    if (moreComing) {
      [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
      reject(@"icloud_v2_capture_incomplete",
             @"CloudKit did not finish the Progress V2 support capture.",
             nil);
      return;
    }
    NSError *archiveError = nil;
    NSString *finalToken = [self base64FromChangeToken:serverChangeToken error:&archiveError];
    if (archiveError != nil || finalToken == nil) {
      [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
      reject(@"icloud_v2_capture_token_failed",
             @"The Progress V2 support capture token could not be archived.",
             [self diagnosticError:archiveError]);
      return;
    }
    resolve(@{
      @"status": @"complete",
      @"ndjsonFileUrl": captureURL.absoluteString,
      @"recordCount": @(finalRecordCount),
      @"deletionCount": @(finalDeletionCount),
      @"familyCounts": finalFamilyCounts,
      @"bytes": @(finalByteCount),
      @"startedAt": startedAt,
      @"completedAt": completedAt,
      @"finalToken": finalToken
    });
  };
  operation.fetchRecordZoneChangesCompletionBlock = ^(NSError *operationError) {
    if (operationError == nil) {
      return;
    }
    [captureLock lock];
    if (finished) {
      [captureLock unlock];
      return;
    }
    finished = YES;
    [fileHandle closeFile];
    [captureLock unlock];
    [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
    if ([self isZoneMissingError:operationError]) {
      resolve(@{
        @"status": @"not_initialized",
        @"recordCount": @0,
        @"deletionCount": @0,
        @"familyCounts": @{},
        @"bytes": @0,
        @"startedAt": startedAt,
        @"completedAt": [self iso8601StringForDate:[NSDate date]]
      });
      return;
    }
    reject(@"icloud_v2_capture_failed",
           @"CloudKit could not capture Progress V2 support data.",
           [self diagnosticError:operationError]);
  };

  dispatch_after(
    dispatch_time(DISPATCH_TIME_NOW,
                  (int64_t)(ChessticizeV2CaptureTimeoutSeconds * NSEC_PER_SEC)),
    dispatch_get_global_queue(QOS_CLASS_UTILITY, 0),
    ^{
      [captureLock lock];
      if (finished) {
        [captureLock unlock];
        return;
      }
      finished = YES;
      [fileHandle closeFile];
      [captureLock unlock];
      [operation cancel];
      [[NSFileManager defaultManager] removeItemAtURL:captureURL error:nil];
      reject(@"icloud_v2_capture_timeout",
             @"The Progress V2 support capture exceeded its time limit.",
             nil);
    });
  [[self privateDatabase] addOperation:operation];
}

RCT_EXPORT_METHOD(modifyV2Records:(NSArray<NSDictionary *> *)saving
                  deleting:(NSArray<NSString *> *)deleting
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSMutableArray<CKRecord *> *recordsToSave = [NSMutableArray arrayWithCapacity:saving.count];
  for (NSDictionary *input in saving) {
    NSError *recordError = nil;
    CKRecord *record = [self v2RecordFromDictionary:input error:&recordError];
    if (recordError != nil || record == nil) {
      reject(@"icloud_v2_record_invalid",
             @"A Progress V2 record is invalid.",
             [self diagnosticError:recordError]);
      return;
    }
    [recordsToSave addObject:record];
  }
  NSMutableArray<CKRecordID *> *recordIDsToDelete = [NSMutableArray arrayWithCapacity:deleting.count];
  for (id value in deleting) {
    if (![value isKindOfClass:[NSString class]] || ((NSString *)value).length == 0) {
      reject(@"icloud_v2_delete_invalid", @"A Progress V2 delete record name is invalid.", nil);
      return;
    }
    [recordIDsToDelete addObject:[[CKRecordID alloc]
      initWithRecordName:(NSString *)value
      zoneID:[self progressV2ZoneID]]];
  }

  CKModifyRecordsOperation *operation = [[CKModifyRecordsOperation alloc]
    initWithRecordsToSave:recordsToSave
    recordIDsToDelete:recordIDsToDelete];
  operation.atomic = NO;
  operation.savePolicy = CKRecordSaveAllKeys;
  operation.qualityOfService = NSQualityOfServiceUtility;
  operation.modifyRecordsCompletionBlock = ^(NSArray<CKRecord *> *savedRecords,
                                              NSArray<CKRecordID *> *deletedRecordIDs,
                                              NSError *operationError) {
    if (operationError != nil && operationError.code != CKErrorPartialFailure) {
      reject(@"icloud_v2_modify_failed",
             @"CloudKit could not modify the Progress V2 records.",
             [self diagnosticError:operationError]);
      return;
    }
    NSMutableArray<NSDictionary *> *errors = [NSMutableArray array];
    NSDictionary *partialErrors = operationError.userInfo[CKPartialErrorsByItemIDKey];
    if ([partialErrors isKindOfClass:[NSDictionary class]]) {
      [partialErrors enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
        if (![value isKindOfClass:[NSError class]]) {
          return;
        }
        NSString *recordName = [key isKindOfClass:[CKRecordID class]]
          ? ((CKRecordID *)key).recordName
          : [key description];
        [errors addObject:[self errorEnvelope:(NSError *)value recordName:recordName]];
      }];
    }
    resolve(@{
      @"savedRecordNames": [savedRecords valueForKeyPath:@"recordID.recordName"] ?: @[],
      @"deletedRecordNames": [deletedRecordIDs valueForKey:@"recordName"] ?: @[],
      @"errors": errors
    });
  };
  [[self privateDatabase] addOperation:operation];
}

RCT_EXPORT_METHOD(fetchV1Metadata:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:ChessticizeV1RecordName];
  CKFetchRecordsOperation *operation = [[CKFetchRecordsOperation alloc] initWithRecordIDs:@[recordID]];
  // This is intentionally metadata-only. Excluding the Asset payload keeps an
  // unchanged V1 bridge check small even when the legacy snapshot is large.
  operation.desiredKeys = @[ChessticizeV1SchemaVersionField, ChessticizeV1UpdatedAtField];
  operation.qualityOfService = NSQualityOfServiceUtility;
  operation.fetchRecordsCompletionBlock = ^(NSDictionary<CKRecordID *, CKRecord *> *recordsByID,
                                             NSError *error) {
    CKRecord *record = recordsByID[recordID];
    if (record != nil) {
      resolve(@{
        @"status": @"available",
        @"changeTag": record.recordChangeTag ?: @""
      });
      return;
    }
    if (error != nil && [self containsUnknownItemError:error]) {
      resolve(@{ @"status": @"missing" });
      return;
    }
    reject(@"icloud_v1_metadata_failed",
           @"CloudKit could not fetch Progress V1 metadata.",
           [self diagnosticError:error]);
  };
  [[self privateDatabase] addOperation:operation];
}

RCT_EXPORT_METHOD(fetchV1Snapshot:(NSString *)expectedChangeTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:ChessticizeV1RecordName];
  [[self privateDatabase] fetchRecordWithID:recordID completionHandler:^(CKRecord *record, NSError *error) {
    if (error != nil) {
      if ([self isUnknownItemError:error]) {
        reject(@"icloud_v1_missing", @"The Progress V1 snapshot disappeared during migration.", nil);
        return;
      }
      reject(@"icloud_v1_fetch_failed",
             @"CloudKit could not fetch the Progress V1 snapshot.",
             [self diagnosticError:error]);
      return;
    }
    if (record == nil || ![record.recordChangeTag isEqualToString:expectedChangeTag]) {
      reject(@"icloud_v1_changed",
             @"The Progress V1 snapshot changed after its metadata check.",
             nil);
      return;
    }
    NSError *payloadError = nil;
    NSString *payload = [self payloadStringFromV1Record:record error:&payloadError];
    if (payloadError != nil || payload.length == 0) {
      reject(@"icloud_v1_payload_invalid",
             @"The Progress V1 snapshot payload is invalid.",
             [self diagnosticError:payloadError]);
      return;
    }
    resolve(@{
      @"payload": payload,
      @"changeTag": record.recordChangeTag ?: @""
    });
  }];
}

- (CKDatabase *)privateDatabase
{
  return [[CKContainer defaultContainer] privateCloudDatabase];
}

- (CKRecordZoneID *)progressV2ZoneID
{
  return [[CKRecordZoneID alloc] initWithZoneName:ChessticizeV2ZoneName
                                        ownerName:CKCurrentUserDefaultName];
}

- (CKRecord *)v2RecordFromDictionary:(NSDictionary *)input error:(NSError **)error
{
  NSString *recordName = [input[@"recordName"] isKindOfClass:[NSString class]] ? input[@"recordName"] : nil;
  NSString *kind = [input[@"kind"] isKindOfClass:[NSString class]] ? input[@"kind"] : nil;
  NSNumber *schemaVersion = [input[@"schemaVersion"] isKindOfClass:[NSNumber class]] ? input[@"schemaVersion"] : nil;
  NSString *payload = [input[@"payload"] isKindOfClass:[NSString class]] ? input[@"payload"] : nil;
  if (recordName.length == 0 || kind.length == 0 || schemaVersion.integerValue != 2 || payload == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                   code:20
                               userInfo:@{NSLocalizedDescriptionKey: @"Progress V2 record fields are invalid."}];
    }
    return nil;
  }
  CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:recordName zoneID:[self progressV2ZoneID]];
  CKRecord *record = [[CKRecord alloc] initWithRecordType:ChessticizeV2RecordType recordID:recordID];
  record[ChessticizeV2KindField] = kind;
  record[ChessticizeV2SchemaVersionField] = schemaVersion;
  record[ChessticizeV2PayloadField] = [payload dataUsingEncoding:NSUTF8StringEncoding];
  return record;
}

- (NSDictionary *)dictionaryFromV2Record:(CKRecord *)record error:(NSError **)error
{
  NSString *kind = [record[ChessticizeV2KindField] isKindOfClass:[NSString class]]
    ? record[ChessticizeV2KindField]
    : nil;
  NSNumber *schemaVersion = [record[ChessticizeV2SchemaVersionField] isKindOfClass:[NSNumber class]]
    ? record[ChessticizeV2SchemaVersionField]
    : nil;
  NSData *payloadData = [record[ChessticizeV2PayloadField] isKindOfClass:[NSData class]]
    ? record[ChessticizeV2PayloadField]
    : nil;
  NSString *payload = payloadData == nil ? nil : [[NSString alloc] initWithData:payloadData encoding:NSUTF8StringEncoding];
  if (![record.recordType isEqualToString:ChessticizeV2RecordType] ||
      kind.length == 0 || schemaVersion.integerValue != 2 || payload == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                   code:21
                               userInfo:@{NSLocalizedDescriptionKey: @"CloudKit Progress V2 record fields are invalid."}];
    }
    return nil;
  }
  return @{
    @"recordName": record.recordID.recordName ?: @"",
    @"kind": kind,
    @"schemaVersion": schemaVersion,
    @"payload": payload
  };
}

- (CKServerChangeToken *)changeTokenFromBase64:(NSString *)value error:(NSError **)error
{
  if (value == nil || (id)value == [NSNull null] || value.length == 0) {
    return nil;
  }
  NSData *data = [[NSData alloc] initWithBase64EncodedString:value options:0];
  if (data == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                   code:30
                               userInfo:@{NSLocalizedDescriptionKey: @"Progress V2 token is not valid base64."}];
    }
    return nil;
  }
  return [NSKeyedUnarchiver unarchivedObjectOfClass:[CKServerChangeToken class]
                                           fromData:data
                                              error:error];
}

- (NSString *)base64FromChangeToken:(CKServerChangeToken *)token error:(NSError **)error
{
  if (token == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                   code:31
                               userInfo:@{NSLocalizedDescriptionKey: @"CloudKit did not return a final Progress V2 token."}];
    }
    return nil;
  }
  NSData *data = [NSKeyedArchiver archivedDataWithRootObject:token
                                      requiringSecureCoding:YES
                                                      error:error];
  return data == nil ? nil : [data base64EncodedStringWithOptions:0];
}

- (NSString *)payloadStringFromV1Record:(CKRecord *)record error:(NSError **)error
{
  id value = record[ChessticizeV1PayloadField];
  if ([value isKindOfClass:[CKAsset class]]) {
    NSURL *fileURL = ((CKAsset *)value).fileURL;
    if (fileURL == nil) {
      if (error != nil) {
        *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                     code:40
                                 userInfo:@{NSLocalizedDescriptionKey: @"CloudKit V1 Asset has no file URL."}];
      }
      return nil;
    }
    return [NSString stringWithContentsOfURL:fileURL encoding:NSUTF8StringEncoding error:error];
  }
  if ([value isKindOfClass:[NSString class]]) {
    return value;
  }
  if (error != nil) {
    *error = [NSError errorWithDomain:@"ChessticizeICloudProgressSync"
                                 code:41
                             userInfo:@{NSLocalizedDescriptionKey: @"CloudKit V1 payload is not an Asset or string."}];
  }
  return nil;
}

- (BOOL)isUnknownItemError:(NSError *)error
{
  return [error.domain isEqualToString:CKErrorDomain] && error.code == CKErrorUnknownItem;
}

- (BOOL)isZoneMissingError:(NSError *)error
{
  return [error.domain isEqualToString:CKErrorDomain] &&
    (error.code == CKErrorZoneNotFound || error.code == CKErrorUnknownItem);
}

- (BOOL)containsUnknownItemError:(NSError *)error
{
  if ([self isUnknownItemError:error]) {
    return YES;
  }
  NSDictionary *partialErrors = error.userInfo[CKPartialErrorsByItemIDKey];
  if (![partialErrors isKindOfClass:[NSDictionary class]]) {
    return NO;
  }
  for (NSError *partialError in partialErrors.allValues) {
    if ([partialError isKindOfClass:[NSError class]] && [self isUnknownItemError:partialError]) {
      return YES;
    }
  }
  return NO;
}

- (void)rejectZoneChangeError:(NSError *)error rejecter:(RCTPromiseRejectBlock)reject
{
  if ([self isZoneMissingError:error]) {
    reject(@"icloud_v2_zone_not_initialized",
           @"The Progress V2 zone has not been initialized.",
           [self diagnosticError:error]);
    return;
  }
  if ([error.domain isEqualToString:CKErrorDomain] && error.code == CKErrorChangeTokenExpired) {
    reject(@"icloud_change_token_expired",
           @"The Progress V2 change token expired and must be rebuilt.",
           [self diagnosticError:error]);
    return;
  }
  reject(@"icloud_v2_fetch_changes_failed",
         @"CloudKit could not fetch Progress V2 changes.",
         [self diagnosticError:error]);
}

- (NSDictionary *)errorEnvelope:(NSError *)error recordName:(NSString *)recordName
{
  return @{
    @"recordName": recordName ?: @"unknown",
    @"code": [NSString stringWithFormat:@"%ld", (long)error.code],
    @"message": error.localizedDescription ?: @"CloudKit record operation failed"
  };
}

- (NSError *)diagnosticError:(NSError *)error
{
  if (error == nil) {
    return nil;
  }
  NSMutableDictionary *userInfo = [NSMutableDictionary dictionary];
  userInfo[@"nativeErrorCode"] = @(error.code);
  userInfo[@"nativeErrorDomain"] = error.domain ?: @"unavailable";
  if ([error.domain isEqualToString:CKErrorDomain]) {
    userInfo[@"cloudKitCode"] = @(error.code);
  }
  id retryAfter = error.userInfo[CKErrorRetryAfterKey];
  if ([retryAfter isKindOfClass:[NSNumber class]]) {
    userInfo[CKErrorRetryAfterKey] = retryAfter;
  }
  return [NSError errorWithDomain:error.domain code:error.code userInfo:userInfo];
}

- (NSData *)ndjsonLineForObject:(NSDictionary *)object error:(NSError **)error
{
  NSData *json = [NSJSONSerialization dataWithJSONObject:object
                                                 options:NSJSONWritingSortedKeys
                                                   error:error];
  if (json == nil) {
    return nil;
  }
  NSMutableData *line = [json mutableCopy];
  const uint8_t newline = '\n';
  [line appendBytes:&newline length:1];
  return line;
}

- (NSError *)captureErrorWithCode:(NSInteger)code message:(NSString *)message
{
  return [NSError errorWithDomain:@"ChessticizeICloudProgressSync.Capture"
                             code:code
                         userInfo:@{NSLocalizedDescriptionKey: message}];
}

- (NSString *)iso8601StringForDate:(NSDate *)date
{
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime |
                            NSISO8601DateFormatWithFractionalSeconds;
  return [formatter stringFromDate:date];
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
