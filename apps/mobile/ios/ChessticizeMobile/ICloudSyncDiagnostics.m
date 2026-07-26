#import <CloudKit/CloudKit.h>
#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <sqlite3.h>

static NSString * const ChessticizeDiagnosticRecordName = @"default";
static NSString * const ChessticizeDiagnosticPayloadField = @"payload";
static NSString * const ChessticizeSupportArchivePrefix = @"Chessticize-Support-";
static NSTimeInterval const ChessticizeCloudKitSnapshotTimeoutSeconds = 8.0;

@interface ICloudSyncDiagnostics : NSObject <RCTBridgeModule>
@end

@implementation ICloudSyncDiagnostics

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(copyText:(NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIPasteboard generalPasteboard].string = text ?: @"";
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(prepareSupportBundle:(NSString *)databasePath
                  diagnosticText:(NSString *)diagnosticText
                  metadata:(NSDictionary *)metadata
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![databasePath isKindOfClass:[NSString class]] || databasePath.length == 0) {
    reject(@"support_database_path_missing", @"The local progress database path is unavailable.", nil);
    return;
  }
  if (![diagnosticText isKindOfClass:[NSString class]]) {
    reject(@"support_diagnostic_invalid", @"The support diagnostic text is invalid.", nil);
    return;
  }

  NSError *directoryError = nil;
  NSURL *workingDirectory = [self createWorkingDirectory:&directoryError];
  if (workingDirectory == nil) {
    reject(@"support_directory_failed", directoryError.localizedDescription, directoryError);
    return;
  }

  NSURL *databaseURL = [workingDirectory URLByAppendingPathComponent:@"local-progress.sqlite"];
  NSError *backupError = nil;
  if (![self backupDatabaseAtPath:[self pathFromInput:databasePath]
                            toURL:databaseURL
                            error:&backupError]) {
    [[NSFileManager defaultManager] removeItemAtURL:workingDirectory error:nil];
    reject(@"support_database_backup_failed", backupError.localizedDescription, backupError);
    return;
  }

  NSURL *diagnosticURL = [workingDirectory URLByAppendingPathComponent:@"diagnostic.txt"];
  NSError *writeError = nil;
  if (![diagnosticText writeToURL:diagnosticURL
                       atomically:YES
                         encoding:NSUTF8StringEncoding
                            error:&writeError]) {
    [[NSFileManager defaultManager] removeItemAtURL:workingDirectory error:nil];
    reject(@"support_diagnostic_write_failed", writeError.localizedDescription, writeError);
    return;
  }

  [self fetchCloudSnapshot:^(NSData *payload,
                             NSString *accountStatus,
                             NSString *unavailableReason) {
    [self finishSupportBundleInDirectory:workingDirectory
                            cloudPayload:payload
                    cloudAccountStatus:accountStatus
                      unavailableReason:unavailableReason
                             metadata:metadata ?: @{}
                             resolver:resolve
                             rejecter:reject];
  }];
}

RCT_EXPORT_METHOD(shareSupportBundle:(NSString *)bundleUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [self fileURLFromInput:bundleUrl];
  if (url == nil ||
      ![self isManagedSupportArchive:url] ||
      ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
    reject(@"support_bundle_missing", @"The prepared support bundle is no longer available.", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = [self topViewController];
    if (presenter == nil) {
      reject(@"support_share_unavailable", @"The iOS Share Sheet is unavailable.", nil);
      return;
    }

    UIActivityViewController *activityController =
      [[UIActivityViewController alloc] initWithActivityItems:@[url]
                                       applicationActivities:nil];
    UIPopoverPresentationController *popover = activityController.popoverPresentationController;
    if (popover != nil) {
      popover.sourceView = presenter.view;
      popover.sourceRect = CGRectMake(CGRectGetMidX(presenter.view.bounds),
                                      CGRectGetMidY(presenter.view.bounds),
                                      1,
                                      1);
      popover.permittedArrowDirections = 0;
    }
    [presenter presentViewController:activityController animated:YES completion:^{
      resolve(@YES);
    }];
  });
}

RCT_EXPORT_METHOD(discardSupportBundle:(NSString *)bundleUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [self fileURLFromInput:bundleUrl];
  if (url == nil || ![self isManagedSupportArchive:url]) {
    reject(@"support_bundle_invalid", @"The support bundle path is invalid.", nil);
    return;
  }
  NSError *error = nil;
  if ([[NSFileManager defaultManager] fileExistsAtPath:url.path] &&
      ![[NSFileManager defaultManager] removeItemAtURL:url error:&error]) {
    reject(@"support_bundle_discard_failed", error.localizedDescription, error);
    return;
  }
  resolve(@YES);
}

- (void)fetchCloudSnapshot:(void (^)(NSData *payload,
                                     NSString *accountStatus,
                                     NSString *unavailableReason))completion
{
  NSObject *completionLock = [NSObject new];
  __block BOOL didFinish = NO;
  BOOL (^isFinished)(void) = ^BOOL {
    @synchronized(completionLock) {
      return didFinish;
    }
  };
  void (^finish)(NSData *, NSString *, NSString *) =
    ^(NSData *payload, NSString *accountStatus, NSString *unavailableReason) {
      @synchronized(completionLock) {
        if (didFinish) {
          return;
        }
        didFinish = YES;
      }
      completion(payload, accountStatus, unavailableReason);
    };

  dispatch_after(
    dispatch_time(DISPATCH_TIME_NOW,
                  (int64_t)(ChessticizeCloudKitSnapshotTimeoutSeconds * NSEC_PER_SEC)),
    dispatch_get_global_queue(QOS_CLASS_UTILITY, 0),
    ^{
      finish(nil,
             @"could_not_determine",
             @"CloudKit snapshot unavailable: the request timed out after 8 seconds.");
    });

  CKContainer *container = [CKContainer defaultContainer];
  [container accountStatusWithCompletionHandler:^(CKAccountStatus status, NSError *statusError) {
    if (isFinished()) {
      return;
    }
    NSString *statusString = [self stringFromAccountStatus:status];
    if (statusError != nil) {
      finish(nil,
             @"could_not_determine",
             [self unavailableReasonForError:statusError
                                      prefix:@"CloudKit account status unavailable"]);
      return;
    }
    if (status != CKAccountStatusAvailable) {
      finish(nil,
             statusString,
             [NSString stringWithFormat:@"CloudKit snapshot unavailable: iCloud account status is %@.",
                                        statusString]);
      return;
    }

    CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:ChessticizeDiagnosticRecordName];
    [container.privateCloudDatabase fetchRecordWithID:recordID
                                    completionHandler:^(CKRecord *record, NSError *fetchError) {
      if (isFinished()) {
        return;
      }
      if (fetchError != nil) {
        if ([fetchError.domain isEqualToString:CKErrorDomain] &&
            fetchError.code == CKErrorUnknownItem) {
          finish(nil,
                 statusString,
                 @"CloudKit snapshot unavailable: no progress snapshot exists yet.");
          return;
        }
        finish(nil,
               statusString,
               [self unavailableReasonForError:fetchError
                                        prefix:@"CloudKit snapshot unavailable"]);
        return;
      }

      NSError *payloadError = nil;
      NSData *payload = [self payloadDataFromRecord:record error:&payloadError];
      if (payloadError != nil || payload.length == 0) {
        finish(nil,
               statusString,
               [self unavailableReasonForError:payloadError
                                        prefix:@"CloudKit snapshot payload unavailable"]);
        return;
      }
      finish(payload, statusString, nil);
    }];
  }];
}

- (void)finishSupportBundleInDirectory:(NSURL *)workingDirectory
                          cloudPayload:(NSData *)cloudPayload
                    cloudAccountStatus:(NSString *)cloudAccountStatus
                      unavailableReason:(NSString *)unavailableReason
                              metadata:(NSDictionary *)metadata
                              resolver:(RCTPromiseResolveBlock)resolve
                              rejecter:(RCTPromiseRejectBlock)reject
{
  NSMutableArray<NSString *> *filenames = [NSMutableArray arrayWithObjects:
    @"local-progress.sqlite",
    @"diagnostic.txt",
    nil
  ];
  if (cloudPayload.length > 0) {
    NSURL *cloudURL = [workingDirectory URLByAppendingPathComponent:@"icloud-progress-snapshot.json"];
    NSError *cloudWriteError = nil;
    if (![cloudPayload writeToURL:cloudURL
                          options:NSDataWritingAtomic
                            error:&cloudWriteError]) {
      unavailableReason = [self unavailableReasonForError:cloudWriteError
                                                   prefix:@"CloudKit snapshot payload could not be written"];
    } else {
      [filenames addObject:@"icloud-progress-snapshot.json"];
    }
  }

  NSString *kind = [filenames containsObject:@"icloud-progress-snapshot.json"]
    ? @"complete"
    : @"partial";
  NSError *manifestError = nil;
  if (![self writeManifestInDirectory:workingDirectory
                            filenames:filenames
                                 kind:kind
                   cloudAccountStatus:cloudAccountStatus
                    unavailableReason:unavailableReason
                             metadata:metadata
                                error:&manifestError]) {
    [[NSFileManager defaultManager] removeItemAtURL:workingDirectory error:nil];
    reject(@"support_manifest_failed", manifestError.localizedDescription, manifestError);
    return;
  }
  [filenames addObject:@"manifest.json"];

  NSURL *archiveURL = [self newArchiveURL];
  NSError *archiveError = nil;
  if (![self writeZipArchiveAtURL:archiveURL
                    fromDirectory:workingDirectory
                        filenames:filenames
                            error:&archiveError]) {
    [[NSFileManager defaultManager] removeItemAtURL:workingDirectory error:nil];
    reject(@"support_archive_failed", archiveError.localizedDescription, archiveError);
    return;
  }
  [[NSFileManager defaultManager] removeItemAtURL:workingDirectory error:nil];

  resolve(@{
    @"bundleUrl": archiveURL.absoluteString,
    @"files": filenames,
    @"kind": kind,
    @"unavailableReason": unavailableReason ?: [NSNull null]
  });
}

- (BOOL)writeManifestInDirectory:(NSURL *)directory
                       filenames:(NSArray<NSString *> *)filenames
                            kind:(NSString *)kind
              cloudAccountStatus:(NSString *)cloudAccountStatus
               unavailableReason:(NSString *)unavailableReason
                        metadata:(NSDictionary *)metadata
                           error:(NSError **)error
{
  NSMutableArray<NSDictionary *> *files = [NSMutableArray array];
  for (NSString *filename in filenames) {
    NSURL *url = [directory URLByAppendingPathComponent:filename];
    NSDictionary *attributes = [[NSFileManager defaultManager]
      attributesOfItemAtPath:url.path
                       error:error];
    if (attributes == nil) {
      return NO;
    }
    NSString *checksum = [self sha256ForURL:url error:error];
    if (checksum == nil) {
      return NO;
    }
    [files addObject:@{
      @"name": filename,
      @"bytes": attributes[NSFileSize] ?: @0,
      @"sha256": checksum
    }];
  }

  NSString *containerIdentifier = [CKContainer defaultContainer].containerIdentifier ?: @"unavailable";
  NSURL *localDatabaseURL = [directory URLByAppendingPathComponent:@"local-progress.sqlite"];
  NSDictionary *manifest = @{
    @"bundleFormatVersion": @1,
    @"createdAt": [self iso8601StringForDate:[NSDate date]],
    @"kind": kind,
    @"app": @{
      @"bundleIdentifier": [NSBundle mainBundle].bundleIdentifier ?: @"unavailable",
      @"version": [self safeString:metadata[@"appVersion"] fallback:@"unavailable"],
      @"build": [self safeString:metadata[@"buildNumber"] fallback:@"unavailable"]
    },
    @"sync": @{
      @"enabled": [metadata[@"iCloudSyncEnabled"] isKindOfClass:[NSNumber class]]
        ? metadata[@"iCloudSyncEnabled"]
        : @NO,
      @"latestStatus": [self safeString:metadata[@"latestSyncStatus"] fallback:@"unavailable"],
      @"accountStatusAtExport": cloudAccountStatus ?: @"could_not_determine",
      @"containerIdentifier": containerIdentifier
    },
    @"environment": @{
      @"platform": @"iOS",
      @"operatingSystemVersion": UIDevice.currentDevice.systemVersion ?: @"unavailable",
      @"deviceFamily": [self deviceFamily]
    },
    @"localDatabase": [self databaseHealthForURL:localDatabaseURL],
    @"cloudSnapshot": @{
      @"available": @([kind isEqualToString:@"complete"]),
      @"unavailableReason": unavailableReason ?: [NSNull null]
    },
    @"files": files,
    @"privacy": @{
      @"appleIdIncluded": @NO,
      @"credentialsIncluded": @NO,
      @"hardwareIdentifiersIncluded": @NO,
      @"appGeneratedSyncIdMayBeIncluded": @YES
    }
  };

  NSData *json = [NSJSONSerialization dataWithJSONObject:manifest
                                                 options:(NSJSONWritingPrettyPrinted |
                                                          NSJSONWritingSortedKeys)
                                                   error:error];
  if (json == nil) {
    return NO;
  }
  return [json writeToURL:[directory URLByAppendingPathComponent:@"manifest.json"]
                  options:NSDataWritingAtomic
                    error:error];
}

- (BOOL)backupDatabaseAtPath:(NSString *)sourcePath
                       toURL:(NSURL *)destinationURL
                       error:(NSError **)error
{
  sqlite3 *source = NULL;
  sqlite3 *destination = NULL;
  sqlite3_backup *backup = NULL;
  int result = sqlite3_open_v2(sourcePath.UTF8String,
                               &source,
                               SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX,
                               NULL);
  if (result != SQLITE_OK) {
    [self assignSQLiteError:error
                       code:result
                   database:source
                    message:@"Could not open the local progress database."];
    if (source != NULL) {
      sqlite3_close(source);
    }
    return NO;
  }

  [[NSFileManager defaultManager] removeItemAtURL:destinationURL error:nil];
  result = sqlite3_open_v2(destinationURL.path.UTF8String,
                           &destination,
                           SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
                           NULL);
  if (result != SQLITE_OK) {
    [self assignSQLiteError:error
                       code:result
                   database:destination
                    message:@"Could not create the local progress snapshot."];
    sqlite3_close(source);
    if (destination != NULL) {
      sqlite3_close(destination);
    }
    return NO;
  }

  backup = sqlite3_backup_init(destination, "main", source, "main");
  if (backup == NULL) {
    [self assignSQLiteError:error
                       code:sqlite3_errcode(destination)
                   database:destination
                    message:@"Could not initialize the local progress snapshot."];
    sqlite3_close(destination);
    sqlite3_close(source);
    return NO;
  }

  NSInteger retryCount = 0;
  do {
    result = sqlite3_backup_step(backup, -1);
    if (result == SQLITE_BUSY || result == SQLITE_LOCKED) {
      sqlite3_sleep(50);
      retryCount += 1;
    }
  } while ((result == SQLITE_BUSY || result == SQLITE_LOCKED) && retryCount < 40);

  int finishResult = sqlite3_backup_finish(backup);
  BOOL succeeded = result == SQLITE_DONE && finishResult == SQLITE_OK;
  if (!succeeded) {
    [self assignSQLiteError:error
                       code:result == SQLITE_DONE ? finishResult : result
                   database:destination
                    message:@"Could not create a consistent local progress snapshot."];
  }
  sqlite3_close(destination);
  sqlite3_close(source);
  return succeeded;
}

- (BOOL)writeZipArchiveAtURL:(NSURL *)archiveURL
               fromDirectory:(NSURL *)directory
                   filenames:(NSArray<NSString *> *)filenames
                       error:(NSError **)error
{
  NSMutableData *archive = [NSMutableData data];
  NSMutableArray<NSDictionary *> *entries = [NSMutableArray array];
  NSDate *now = [NSDate date];
  uint16_t dosTime = [self dosTimeForDate:now];
  uint16_t dosDate = [self dosDateForDate:now];

  for (NSString *filename in filenames) {
    NSData *nameData = [filename dataUsingEncoding:NSUTF8StringEncoding];
    NSData *fileData = [NSData dataWithContentsOfURL:[directory URLByAppendingPathComponent:filename]
                                            options:NSDataReadingMappedIfSafe
                                              error:error];
    if (fileData == nil) {
      return NO;
    }
    if (nameData.length > UINT16_MAX ||
        fileData.length > UINT32_MAX ||
        archive.length > UINT32_MAX) {
      if (error != NULL) {
        *error = [NSError errorWithDomain:@"ChessticizeSupportBundle"
                                     code:20
                                 userInfo:@{
          NSLocalizedDescriptionKey: @"A support bundle file is too large for the ZIP format."
        }];
      }
      return NO;
    }

    uint32_t crc = [self crc32ForData:fileData];
    uint32_t localOffset = (uint32_t)archive.length;
    [self appendUInt32:0x04034b50 toData:archive];
    [self appendUInt16:20 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:dosTime toData:archive];
    [self appendUInt16:dosDate toData:archive];
    [self appendUInt32:crc toData:archive];
    [self appendUInt32:(uint32_t)fileData.length toData:archive];
    [self appendUInt32:(uint32_t)fileData.length toData:archive];
    [self appendUInt16:(uint16_t)nameData.length toData:archive];
    [self appendUInt16:0 toData:archive];
    [archive appendData:nameData];
    [archive appendData:fileData];

    [entries addObject:@{
      @"crc": @(crc),
      @"nameData": nameData,
      @"offset": @(localOffset),
      @"size": @((uint32_t)fileData.length)
    }];
  }

  if (entries.count > UINT16_MAX || archive.length > UINT32_MAX) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"ChessticizeSupportBundle"
                                   code:21
                               userInfo:@{
        NSLocalizedDescriptionKey: @"The support bundle is too large for the ZIP format."
      }];
    }
    return NO;
  }

  uint32_t centralOffset = (uint32_t)archive.length;
  for (NSDictionary *entry in entries) {
    NSData *nameData = entry[@"nameData"];
    uint32_t size = [entry[@"size"] unsignedIntValue];
    [self appendUInt32:0x02014b50 toData:archive];
    [self appendUInt16:20 toData:archive];
    [self appendUInt16:20 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:dosTime toData:archive];
    [self appendUInt16:dosDate toData:archive];
    [self appendUInt32:[entry[@"crc"] unsignedIntValue] toData:archive];
    [self appendUInt32:size toData:archive];
    [self appendUInt32:size toData:archive];
    [self appendUInt16:(uint16_t)nameData.length toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt16:0 toData:archive];
    [self appendUInt32:0 toData:archive];
    [self appendUInt32:[entry[@"offset"] unsignedIntValue] toData:archive];
    [archive appendData:nameData];
  }

  uint32_t centralSize = (uint32_t)archive.length - centralOffset;
  [self appendUInt32:0x06054b50 toData:archive];
  [self appendUInt16:0 toData:archive];
  [self appendUInt16:0 toData:archive];
  [self appendUInt16:(uint16_t)entries.count toData:archive];
  [self appendUInt16:(uint16_t)entries.count toData:archive];
  [self appendUInt32:centralSize toData:archive];
  [self appendUInt32:centralOffset toData:archive];
  [self appendUInt16:0 toData:archive];

  return [archive writeToURL:archiveURL options:NSDataWritingAtomic error:error];
}

- (NSURL *)createWorkingDirectory:(NSError **)error
{
  NSString *name = [NSString stringWithFormat:@"chessticize-support-work-%@",
                                              [NSUUID UUID].UUIDString];
  NSURL *url = [NSURL fileURLWithPath:[NSTemporaryDirectory()
    stringByAppendingPathComponent:name]
                         isDirectory:YES];
  BOOL created = [[NSFileManager defaultManager] createDirectoryAtURL:url
                                           withIntermediateDirectories:NO
                                                            attributes:nil
                                                                 error:error];
  return created ? url : nil;
}

- (NSURL *)newArchiveURL
{
  NSString *timestamp = [[self iso8601StringForDate:[NSDate date]]
    stringByReplacingOccurrencesOfString:@":"
                              withString:@"-"];
  NSString *name = [NSString stringWithFormat:@"%@%@-%@.zip",
                                              ChessticizeSupportArchivePrefix,
                                              timestamp,
                                              [NSUUID UUID].UUIDString];
  return [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:name]];
}

- (NSData *)payloadDataFromRecord:(CKRecord *)record error:(NSError **)error
{
  id value = record[ChessticizeDiagnosticPayloadField];
  if ([value isKindOfClass:[CKAsset class]]) {
    NSURL *fileURL = ((CKAsset *)value).fileURL;
    if (fileURL == nil) {
      if (error != NULL) {
        *error = [NSError errorWithDomain:@"ChessticizeSupportBundle"
                                     code:10
                                 userInfo:@{
          NSLocalizedDescriptionKey: @"CloudKit payload asset is missing its file URL."
        }];
      }
      return nil;
    }
    return [NSData dataWithContentsOfURL:fileURL
                                 options:NSDataReadingMappedIfSafe
                                   error:error];
  }
  if ([value isKindOfClass:[NSString class]]) {
    return [value dataUsingEncoding:NSUTF8StringEncoding];
  }
  if (error != NULL) {
    *error = [NSError errorWithDomain:@"ChessticizeSupportBundle"
                                 code:11
                             userInfo:@{
      NSLocalizedDescriptionKey: @"CloudKit payload field is missing or invalid."
    }];
  }
  return nil;
}

- (NSDictionary *)databaseHealthForURL:(NSURL *)url
{
  sqlite3 *database = NULL;
  int openResult = sqlite3_open_v2(url.path.UTF8String,
                                   &database,
                                   SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX,
                                   NULL);
  if (openResult != SQLITE_OK) {
    NSString *message = database != NULL
      ? [NSString stringWithUTF8String:sqlite3_errmsg(database)]
      : @"SQLite database unavailable";
    if (database != NULL) {
      sqlite3_close(database);
    }
    return @{
      @"capturedWith": @"sqlite3_backup",
      @"healthAvailable": @NO,
      @"healthError": message ?: @"Could not open the database snapshot."
    };
  }

  NSString *quickCheck = [self stringResultForSQL:@"PRAGMA quick_check" database:database];
  NSNumber *userVersion = [self integerResultForSQL:@"PRAGMA user_version" database:database];
  NSNumber *pageCount = [self integerResultForSQL:@"PRAGMA page_count" database:database];
  NSNumber *freelistCount = [self integerResultForSQL:@"PRAGMA freelist_count" database:database];
  NSString *errorMessage = [NSString stringWithUTF8String:sqlite3_errmsg(database)];
  sqlite3_close(database);

  BOOL healthAvailable = quickCheck != nil &&
                         userVersion != nil &&
                         pageCount != nil &&
                         freelistCount != nil;
  return @{
    @"capturedWith": @"sqlite3_backup",
    @"healthAvailable": @(healthAvailable),
    @"integrityCheck": quickCheck ?: [NSNull null],
    @"userVersion": userVersion ?: [NSNull null],
    @"pageCount": pageCount ?: [NSNull null],
    @"freelistCount": freelistCount ?: [NSNull null],
    @"healthError": healthAvailable ? [NSNull null] : (errorMessage ?: @"Database health check failed.")
  };
}

- (NSString *)stringResultForSQL:(NSString *)sql database:(sqlite3 *)database
{
  sqlite3_stmt *statement = NULL;
  int result = sqlite3_prepare_v2(database, sql.UTF8String, -1, &statement, NULL);
  if (result != SQLITE_OK || sqlite3_step(statement) != SQLITE_ROW) {
    if (statement != NULL) {
      sqlite3_finalize(statement);
    }
    return nil;
  }
  const unsigned char *value = sqlite3_column_text(statement, 0);
  NSString *text = value != NULL ? [NSString stringWithUTF8String:(const char *)value] : nil;
  sqlite3_finalize(statement);
  return text;
}

- (NSNumber *)integerResultForSQL:(NSString *)sql database:(sqlite3 *)database
{
  sqlite3_stmt *statement = NULL;
  int result = sqlite3_prepare_v2(database, sql.UTF8String, -1, &statement, NULL);
  if (result != SQLITE_OK || sqlite3_step(statement) != SQLITE_ROW) {
    if (statement != NULL) {
      sqlite3_finalize(statement);
    }
    return nil;
  }
  sqlite3_int64 value = sqlite3_column_int64(statement, 0);
  sqlite3_finalize(statement);
  return @(value);
}

- (NSString *)deviceFamily
{
  switch (UIDevice.currentDevice.userInterfaceIdiom) {
    case UIUserInterfaceIdiomPhone:
      return @"iPhone";
    case UIUserInterfaceIdiomPad:
      return @"iPad";
    case UIUserInterfaceIdiomTV:
      return @"Apple TV";
    case UIUserInterfaceIdiomCarPlay:
      return @"CarPlay";
    default:
      return @"Apple device";
  }
}

- (NSString *)sha256ForURL:(NSURL *)url error:(NSError **)error
{
  NSData *data = [NSData dataWithContentsOfURL:url
                                      options:NSDataReadingMappedIfSafe
                                        error:error];
  if (data == nil) {
    return nil;
  }
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *result = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (NSInteger index = 0; index < CC_SHA256_DIGEST_LENGTH; index += 1) {
    [result appendFormat:@"%02x", digest[index]];
  }
  return result;
}

- (uint32_t)crc32ForData:(NSData *)data
{
  const uint8_t *bytes = data.bytes;
  uint32_t crc = 0xFFFFFFFF;
  for (NSUInteger index = 0; index < data.length; index += 1) {
    crc ^= bytes[index];
    for (NSInteger bit = 0; bit < 8; bit += 1) {
      uint32_t mask = (uint32_t)-(int32_t)(crc & 1);
      crc = (crc >> 1) ^ (0xEDB88320 & mask);
    }
  }
  return ~crc;
}

- (void)appendUInt16:(uint16_t)value toData:(NSMutableData *)data
{
  uint8_t bytes[2] = {
    (uint8_t)(value & 0xFF),
    (uint8_t)((value >> 8) & 0xFF)
  };
  [data appendBytes:bytes length:sizeof(bytes)];
}

- (void)appendUInt32:(uint32_t)value toData:(NSMutableData *)data
{
  uint8_t bytes[4] = {
    (uint8_t)(value & 0xFF),
    (uint8_t)((value >> 8) & 0xFF),
    (uint8_t)((value >> 16) & 0xFF),
    (uint8_t)((value >> 24) & 0xFF)
  };
  [data appendBytes:bytes length:sizeof(bytes)];
}

- (uint16_t)dosTimeForDate:(NSDate *)date
{
  NSDateComponents *components = [[NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian]
    components:(NSCalendarUnitHour | NSCalendarUnitMinute | NSCalendarUnitSecond)
      fromDate:date];
  return (uint16_t)((components.hour << 11) |
                    (components.minute << 5) |
                    (components.second / 2));
}

- (uint16_t)dosDateForDate:(NSDate *)date
{
  NSDateComponents *components = [[NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian]
    components:(NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay)
      fromDate:date];
  NSInteger year = MAX(1980, components.year);
  return (uint16_t)(((year - 1980) << 9) |
                    (components.month << 5) |
                    components.day);
}

- (NSString *)iso8601StringForDate:(NSDate *)date
{
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime |
                            NSISO8601DateFormatWithFractionalSeconds;
  return [formatter stringFromDate:date];
}

- (NSString *)pathFromInput:(NSString *)input
{
  NSURL *url = [self fileURLFromInput:input];
  return url != nil ? url.path : input;
}

- (NSURL *)fileURLFromInput:(NSString *)input
{
  if (![input isKindOfClass:[NSString class]] || input.length == 0) {
    return nil;
  }
  if ([input hasPrefix:@"file://"]) {
    return [NSURL URLWithString:input];
  }
  return [NSURL fileURLWithPath:input];
}

- (BOOL)isManagedSupportArchive:(NSURL *)url
{
  NSString *temporaryPath = [NSURL fileURLWithPath:NSTemporaryDirectory()
                                        isDirectory:YES].standardizedURL.path;
  NSString *path = url.standardizedURL.path;
  return [path hasPrefix:[temporaryPath stringByAppendingString:@"/"]] &&
         [url.lastPathComponent hasPrefix:ChessticizeSupportArchivePrefix] &&
         [url.pathExtension.lowercaseString isEqualToString:@"zip"];
}

- (NSString *)safeString:(id)value fallback:(NSString *)fallback
{
  return [value isKindOfClass:[NSString class]] && [value length] > 0
    ? value
    : fallback;
}

- (NSString *)unavailableReasonForError:(NSError *)error prefix:(NSString *)prefix
{
  if (error == nil) {
    return [NSString stringWithFormat:@"%@: unknown error.", prefix];
  }
  return [NSString stringWithFormat:@"%@: %@ (%ld): %@",
                                    prefix,
                                    error.domain,
                                    (long)error.code,
                                    error.localizedDescription];
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

- (void)assignSQLiteError:(NSError **)error
                     code:(int)code
                 database:(sqlite3 *)database
                  message:(NSString *)message
{
  if (error == NULL) {
    return;
  }
  NSString *detail = database != NULL
    ? [NSString stringWithUTF8String:sqlite3_errmsg(database)]
    : @"SQLite database unavailable";
  *error = [NSError errorWithDomain:@"ChessticizeSupportBundle.SQLite"
                               code:code
                           userInfo:@{
    NSLocalizedDescriptionKey: [NSString stringWithFormat:@"%@ %@", message, detail]
  }];
}

- (UIViewController *)topViewController
{
  UIWindow *window = nil;
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (scene.activationState != UISceneActivationStateForegroundActive ||
        ![scene isKindOfClass:[UIWindowScene class]]) {
      continue;
    }
    for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
      if (candidate.isKeyWindow) {
        window = candidate;
        break;
      }
    }
    if (window != nil) {
      break;
    }
  }
  UIViewController *controller = window.rootViewController;
  while (controller.presentedViewController != nil) {
    controller = controller.presentedViewController;
  }
  if ([controller isKindOfClass:[UINavigationController class]]) {
    controller = ((UINavigationController *)controller).visibleViewController;
  }
  if ([controller isKindOfClass:[UITabBarController class]]) {
    controller = ((UITabBarController *)controller).selectedViewController;
  }
  return controller;
}

@end
