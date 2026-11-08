#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

// Renders an SF Symbol for the shared JS Icon component (#609). The symbol name,
// point size, weight and color come from JS; the view is decorative, so the
// accessible label stays on the surrounding control. Rendered under the New
// Architecture through the legacy view-manager interop layer.

@interface ChessticizeSymbolView : UIImageView
@property (nonatomic, copy) NSString *symbolName;
@property (nonatomic, assign) CGFloat pointSize;
@property (nonatomic, copy) NSString *symbolWeight;
@end

@implementation ChessticizeSymbolView

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    self.contentMode = UIViewContentModeCenter;
    self.isAccessibilityElement = NO;
    self.accessibilityElementsHidden = YES;
  }
  return self;
}

- (void)setSymbolName:(NSString *)symbolName
{
  _symbolName = [symbolName copy];
  [self updateSymbol];
}

- (void)setPointSize:(CGFloat)pointSize
{
  _pointSize = pointSize;
  [self updateSymbol];
}

- (void)setSymbolWeight:(NSString *)symbolWeight
{
  _symbolWeight = [symbolWeight copy];
  [self updateSymbol];
}

- (void)updateSymbol
{
  if (self.symbolName.length == 0) {
    self.image = nil;
    return;
  }
  UIImageSymbolWeight weight = UIImageSymbolWeightRegular;
  if ([self.symbolWeight isEqualToString:@"semibold"]) {
    weight = UIImageSymbolWeightSemibold;
  } else if ([self.symbolWeight isEqualToString:@"bold"]) {
    weight = UIImageSymbolWeightBold;
  }
  UIImageSymbolConfiguration *configuration =
    [UIImageSymbolConfiguration configurationWithPointSize:(self.pointSize > 0 ? self.pointSize : 17)
                                                    weight:weight
                                                     scale:UIImageSymbolScaleMedium];
  self.image = [UIImage systemImageNamed:self.symbolName withConfiguration:configuration];
}

@end

@interface ChessticizeSymbolViewManager : RCTViewManager
@end

@implementation ChessticizeSymbolViewManager

RCT_EXPORT_MODULE(ChessticizeSymbolView)

- (UIView *)view
{
  return [[ChessticizeSymbolView alloc] initWithFrame:CGRectZero];
}

RCT_EXPORT_VIEW_PROPERTY(symbolName, NSString)
RCT_EXPORT_VIEW_PROPERTY(pointSize, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(symbolWeight, NSString)

RCT_CUSTOM_VIEW_PROPERTY(symbolColor, UIColor, ChessticizeSymbolView)
{
  view.tintColor = json ? [RCTConvert UIColor:json] : nil;
}

@end
