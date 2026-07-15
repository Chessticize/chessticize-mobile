#import "NativeStockfishEngine.h"

#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "../../../native/stockfish/Bridge/StockfishRunner.h"

using Chessticize::StockfishBridge::StockfishRunner;

namespace {

constexpr NSString* StockfishLineEvent = @"StockfishEngineLine";

std::string toStdString(NSString* value) {
  return value == nil ? std::string() : std::string([value UTF8String]);
}

NSString* toNSString(std::string_view value) {
  return [[NSString alloc] initWithBytes:value.data()
                                  length:value.size()
                                encoding:NSUTF8StringEncoding];
}

void setFailureReason(NSString** failureReason, NSString* reason) {
  if (failureReason != nullptr) {
    *failureReason = reason;
  }
}

bool loadBundledNetworkPaths(
    std::vector<std::string>* networkPaths,
    NSString** failureReason) {
  NSString* manifestPath = [[NSBundle mainBundle] pathForResource:@"stockfish-artifacts" ofType:@"json"];
  if (manifestPath == nil) {
    setFailureReason(failureReason, @"The Stockfish artifact manifest is missing from the app bundle.");
    return false;
  }

  NSError* readError = nil;
  NSData* manifestData = [NSData dataWithContentsOfFile:manifestPath
                                                options:0
                                                  error:&readError];
  if (manifestData == nil) {
    setFailureReason(failureReason, readError.localizedDescription);
    return false;
  }

  NSError* parseError = nil;
  id root = [NSJSONSerialization JSONObjectWithData:manifestData options:0 error:&parseError];
  if (![root isKindOfClass:[NSDictionary class]]) {
    setFailureReason(
        failureReason,
        parseError.localizedDescription ?: @"The Stockfish artifact manifest is invalid.");
    return false;
  }

  id declaredNetworks = [(NSDictionary*)root objectForKey:@"nnue"];
  if (![declaredNetworks isKindOfClass:[NSArray class]] || [(NSArray*)declaredNetworks count] != 2) {
    setFailureReason(
        failureReason,
        @"The Stockfish artifact manifest must declare the big and small NNUE networks.");
    return false;
  }

  NSRegularExpression* canonicalName = [NSRegularExpression
      regularExpressionWithPattern:@"^nn-[a-f0-9]{12}\\.nnue$"
                           options:0
                             error:nil];
  for (id relativePath in (NSArray*)declaredNetworks) {
    if (![relativePath isKindOfClass:[NSString class]]) {
      setFailureReason(failureReason, @"The Stockfish artifact manifest contains an invalid NNUE path.");
      return false;
    }
    NSString* fileName = [(NSString*)relativePath lastPathComponent];
    NSRange fullRange = NSMakeRange(0, fileName.length);
    if ([canonicalName numberOfMatchesInString:fileName options:0 range:fullRange] != 1) {
      setFailureReason(failureReason, @"The Stockfish artifact manifest contains an invalid NNUE filename.");
      return false;
    }
    NSString* bundledPath = [[NSBundle mainBundle] pathForResource:fileName ofType:nil];
    if (bundledPath == nil) {
      setFailureReason(
          failureReason,
          [NSString stringWithFormat:@"The bundled Stockfish NNUE network %@ is missing.", fileName]);
      return false;
    }
    networkPaths->push_back(toStdString(bundledPath));
  }
  return true;
}

}  // namespace

@implementation NativeStockfishEngine {
  dispatch_queue_t _engineQueue;
  std::unique_ptr<StockfishRunner> _runner;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if ((self = [super init])) {
    _engineQueue = dispatch_queue_create("app.chessticize.stockfish", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSArray<NSString*>*)supportedEvents {
  return @[ StockfishLineEvent ];
}

RCT_REMAP_METHOD(start,
                 startWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(_engineQueue, ^{
    @try {
      BOOL created = self->_runner == nullptr;
      if (created) {
        std::vector<std::string> networkPaths;
        NSString* failureReason = nil;
        if (!loadBundledNetworkPaths(&networkPaths, &failureReason)) {
          reject(@"stockfish_start_failed", failureReason, nil);
          return;
        }

        __weak NativeStockfishEngine* weakSelf = self;
        self->_runner = std::make_unique<StockfishRunner>(
            [weakSelf](std::string line) {
              NativeStockfishEngine* strongSelf = weakSelf;
              if (strongSelf == nil) {
                return;
              }
              NSString* nativeLine = toNSString(line);
              dispatch_async(dispatch_get_main_queue(), ^{
                [strongSelf sendEventWithName:StockfishLineEvent body:@{ @"line": nativeLine }];
              });
            },
            networkPaths[0],
            networkPaths[1]);
      }
      resolve(@(created));
    } @catch (NSException* exception) {
      reject(@"stockfish_start_failed", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(send:(NSString*)command) {
  std::string nativeCommand = toStdString(command);
  dispatch_async(_engineQueue, ^{
    if (self->_runner == nullptr) {
      return;
    }
    self->_runner->handle(nativeCommand);
  });
}

RCT_EXPORT_METHOD(terminate) {
  dispatch_async(_engineQueue, ^{
    self->_runner.reset();
  });
}

@end
