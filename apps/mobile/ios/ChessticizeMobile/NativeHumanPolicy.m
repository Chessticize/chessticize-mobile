#import <CommonCrypto/CommonDigest.h>
#import <CoreML/CoreML.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

static NSString *const kMaia2BundleResourceName = @"maia2-rapid-int8";
static NSString *const kMaia2BundleResourceExt = @"mlmodelc";
static const NSInteger kMaia2TensorFloats = 18 * 8 * 8; // 1152
static const NSInteger kMaia2VocabSize = 1880;
static const NSInteger kMaia2CoreMLBatchSize = 2;

@interface NativeHumanPolicy : NSObject <RCTBridgeModule>
@end

@implementation NativeHumanPolicy {
  dispatch_queue_t _inferenceQueue;
  MLModel *_model;
  NSString *_verifiedWeightSha256;
  id _memoryWarningObserver;
}

RCT_EXPORT_MODULE(NativeHumanPolicy);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  self = [super init];
  if (self != nil) {
    dispatch_queue_attr_t attr = dispatch_queue_attr_make_with_qos_class(
      DISPATCH_QUEUE_SERIAL,
      QOS_CLASS_USER_INITIATED,
      0
    );
    _inferenceQueue = dispatch_queue_create("com.chessticize.mobile.humanPolicy", attr);

    __weak typeof(self) weakSelf = self;
    _memoryWarningObserver = [[NSNotificationCenter defaultCenter]
      addObserverForName:UIApplicationDidReceiveMemoryWarningNotification
                  object:nil
                   queue:nil
              usingBlock:^(__unused NSNotification *note) {
                __strong typeof(self) strongSelf = weakSelf;
                if (strongSelf == nil) {
                  return;
                }
                dispatch_async(strongSelf->_inferenceQueue, ^{
                  strongSelf->_model = nil;
                });
              }];
  }
  return self;
}

- (void)dealloc
{
  if (_memoryWarningObserver != nil) {
    [[NSNotificationCenter defaultCenter] removeObserver:_memoryWarningObserver];
    _memoryWarningObserver = nil;
  }
}

- (nullable NSURL *)bundledModelURL
{
  return [[NSBundle mainBundle] URLForResource:kMaia2BundleResourceName
                                 withExtension:kMaia2BundleResourceExt];
}

- (nullable NSString *)sha256HexForFileURL:(NSURL *)fileURL error:(NSError **)error
{
  NSFileHandle *handle = [NSFileHandle fileHandleForReadingFromURL:fileURL error:error];
  if (handle == nil) {
    return nil;
  }

  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  @try {
    while (YES) {
      @autoreleasepool {
        NSData *chunk = [handle readDataOfLength:262144];
        if (chunk.length == 0) {
          break;
        }
        CC_SHA256_Update(&ctx, chunk.bytes, (CC_LONG)chunk.length);
      }
    }
  } @finally {
    [handle closeFile];
  }

  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (NSInteger i = 0; i < CC_SHA256_DIGEST_LENGTH; i += 1) {
    [hex appendFormat:@"%02x", digest[i]];
  }
  return [hex copy];
}

- (nullable MLModel *)ensureModelLoadedWithExpectedSha256:(nullable NSString *)expectedSha256
                                                    error:(NSError **)error
{
  if (_model != nil) {
    if (expectedSha256.length == 0 ||
        (_verifiedWeightSha256 != nil &&
         [_verifiedWeightSha256 caseInsensitiveCompare:expectedSha256] == NSOrderedSame)) {
      return _model;
    }
  }

  NSURL *modelURL = [self bundledModelURL];
  if (modelURL == nil) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"com.chessticize.mobile.humanPolicy"
                                   code:404
                               userInfo:@{
                                 NSLocalizedDescriptionKey: @"Bundled Maia-2 CoreML model is not present."
                               }];
    }
    return nil;
  }

  NSString *normalizedExpected = expectedSha256;
  if ([normalizedExpected hasPrefix:@"sha256:"]) {
    normalizedExpected = [normalizedExpected substringFromIndex:7];
  }

  if (normalizedExpected.length > 0 &&
      (_verifiedWeightSha256 == nil ||
       [_verifiedWeightSha256 caseInsensitiveCompare:normalizedExpected] != NSOrderedSame)) {
    NSURL *weightURL = [[modelURL URLByAppendingPathComponent:@"weights" isDirectory:YES]
      URLByAppendingPathComponent:@"weight.bin" isDirectory:NO];
    NSString *actualSha = [self sha256HexForFileURL:weightURL error:error];
    if (actualSha == nil) {
      return nil;
    }
    if ([actualSha caseInsensitiveCompare:normalizedExpected] != NSOrderedSame) {
      if (error != NULL) {
        *error = [NSError errorWithDomain:@"com.chessticize.mobile.humanPolicy"
                                     code:422
                                 userInfo:@{
                                   NSLocalizedDescriptionKey: @"Maia-2 CoreML weight SHA-256 mismatch."
                                 }];
      }
      return nil;
    }
    _verifiedWeightSha256 = actualSha;
  }

  MLModelConfiguration *config = [[MLModelConfiguration alloc] init];
  config.computeUnits = MLComputeUnitsAll;
  MLModel *loaded = [MLModel modelWithContentsOfURL:modelURL configuration:config error:error];
  if (loaded == nil) {
    return nil;
  }
  _model = loaded;
  return _model;
}

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                     rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  dispatch_async(_inferenceQueue, ^{
    NSURL *modelURL = [self bundledModelURL];
    BOOL exists = modelURL != nil &&
      [[NSFileManager defaultManager] fileExistsAtPath:modelURL.path];
    resolve(@(exists));
  });
}

RCT_EXPORT_METHOD(loadModel:(nullable NSString *)expectedWeightSha256
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_inferenceQueue, ^{
    NSError *error = nil;
    MLModel *model = [self ensureModelLoadedWithExpectedSha256:expectedWeightSha256 error:&error];
    if (model == nil) {
      reject(@"maia2_load_failed", error.localizedDescription ?: @"Failed to load Maia-2 model.", error);
      return;
    }
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(scoreBatch:(NSString *)boardsBase64
                     eloSelf:(NSArray<NSNumber *> *)eloSelf
                     eloOppo:(NSArray<NSNumber *> *)eloOppo
                    resolver:(RCTPromiseResolveBlock)resolve
                    rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_inferenceQueue, ^{
    NSInteger batchSize = (NSInteger)eloSelf.count;
    if (batchSize <= 0 || batchSize != (NSInteger)eloOppo.count) {
      reject(@"maia2_invalid_batch", @"eloSelf and eloOppo must have identical non-zero length.", nil);
      return;
    }

    NSData *boardsData = [[NSData alloc] initWithBase64EncodedString:boardsBase64 options:0];
    NSUInteger expectedBytes = (NSUInteger)batchSize * (NSUInteger)kMaia2TensorFloats * sizeof(float);
    if (boardsData == nil || boardsData.length != expectedBytes) {
      reject(@"maia2_invalid_boards", @"boardsBase64 byte length does not match batchSize * 1152 * 4.", nil);
      return;
    }

    NSError *error = nil;
    MLModel *model = [self ensureModelLoadedWithExpectedSha256:self->_verifiedWeightSha256 error:&error];
    if (model == nil) {
      reject(@"maia2_not_loaded", error.localizedDescription ?: @"Maia-2 model is not loaded.", error);
      return;
    }

    const float *boardsPtr = (const float *)boardsData.bytes;
    NSMutableData *outData = [NSMutableData dataWithLength:(NSUInteger)batchSize * (NSUInteger)kMaia2VocabSize * sizeof(float)];
    float *outPtr = (float *)outData.mutableBytes;

    // Reusable static batch=2 MLMultiArrays for ANE execution.
    MLMultiArray *boardsArray = [[MLMultiArray alloc]
      initWithShape:@[@(kMaia2CoreMLBatchSize), @18, @8, @8]
           dataType:MLMultiArrayDataTypeFloat32
              error:&error];
    MLMultiArray *selfArray = [[MLMultiArray alloc]
      initWithShape:@[@(kMaia2CoreMLBatchSize)]
           dataType:MLMultiArrayDataTypeInt32
              error:&error];
    MLMultiArray *oppoArray = [[MLMultiArray alloc]
      initWithShape:@[@(kMaia2CoreMLBatchSize)]
           dataType:MLMultiArrayDataTypeInt32
              error:&error];
    if (boardsArray == nil || selfArray == nil || oppoArray == nil) {
      reject(@"maia2_alloc_failed", error.localizedDescription ?: @"Failed to allocate CoreML inputs.", error);
      return;
    }

    float *bBuf = (float *)boardsArray.dataPointer;
    int32_t *sBuf = (int32_t *)selfArray.dataPointer;
    int32_t *oBuf = (int32_t *)oppoArray.dataPointer;

    for (NSInteger start = 0; start < batchSize; start += kMaia2CoreMLBatchSize) {
      @autoreleasepool {
        NSInteger validInChunk = MIN(kMaia2CoreMLBatchSize, batchSize - start);
        for (NSInteger slot = 0; slot < kMaia2CoreMLBatchSize; slot += 1) {
          NSInteger srcIdx = start + (slot < validInChunk ? slot : (validInChunk - 1));
          memcpy(
            bBuf + slot * kMaia2TensorFloats,
            boardsPtr + srcIdx * kMaia2TensorFloats,
            (size_t)kMaia2TensorFloats * sizeof(float)
          );
          sBuf[slot] = (int32_t)eloSelf[srcIdx].intValue;
          oBuf[slot] = (int32_t)eloOppo[srcIdx].intValue;
        }

        MLDictionaryFeatureProvider *inputProvider = [[MLDictionaryFeatureProvider alloc]
          initWithDictionary:@{
            @"boards": [MLFeatureValue featureValueWithMultiArray:boardsArray],
            @"elos_self": [MLFeatureValue featureValueWithMultiArray:selfArray],
            @"elos_oppo": [MLFeatureValue featureValueWithMultiArray:oppoArray],
          }
                       error:&error];
        if (inputProvider == nil) {
          reject(@"maia2_input_failed", error.localizedDescription ?: @"Failed to build CoreML feature provider.", error);
          return;
        }

        id<MLFeatureProvider> prediction = [model predictionFromFeatures:inputProvider error:&error];
        if (prediction == nil) {
          reject(@"maia2_predict_failed", error.localizedDescription ?: @"CoreML prediction failed.", error);
          return;
        }

        MLMultiArray *logits = [prediction featureValueForName:@"logits_maia"].multiArrayValue;
        if (logits == nil || logits.count < kMaia2CoreMLBatchSize * kMaia2VocabSize) {
          reject(@"maia2_output_invalid", @"CoreML output logits_maia was missing or had unexpected length.", nil);
          return;
        }

        if (logits.dataType == MLMultiArrayDataTypeFloat32) {
          const float *srcLogits = (const float *)logits.dataPointer;
          NSInteger rowStride = logits.strides.count >= 2
            ? logits.strides[0].integerValue
            : kMaia2VocabSize;
          NSInteger colStride = logits.strides.count >= 2
            ? logits.strides[1].integerValue
            : 1;
          for (NSInteger slot = 0; slot < validInChunk; slot += 1) {
            float *dstRow = outPtr + (start + slot) * kMaia2VocabSize;
            const float *srcRow = srcLogits + slot * rowStride;
            if (colStride == 1) {
              memcpy(dstRow, srcRow, (size_t)kMaia2VocabSize * sizeof(float));
            } else {
              for (NSInteger col = 0; col < kMaia2VocabSize; col += 1) {
                dstRow[col] = srcRow[col * colStride];
              }
            }
          }
        } else {
          for (NSInteger slot = 0; slot < validInChunk; slot += 1) {
            for (NSInteger col = 0; col < kMaia2VocabSize; col += 1) {
              NSArray<NSNumber *> *coord = @[@(slot), @(col)];
              outPtr[(start + slot) * kMaia2VocabSize + col] = [logits objectForKeyedSubscript:coord].floatValue;
            }
          }
        }
      }
    }

    resolve([outData base64EncodedStringWithOptions:0]);
  });
}

RCT_EXPORT_METHOD(unload:(RCTPromiseResolveBlock)resolve
                rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  dispatch_async(_inferenceQueue, ^{
    self->_model = nil;
    resolve(@YES);
  });
}

@end
