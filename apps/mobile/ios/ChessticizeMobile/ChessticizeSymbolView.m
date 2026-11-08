#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

// Renders an SF Symbol for the shared JS Icon component (#609). The symbol name,
// point size, weight and color come from JS; the view is decorative, so the
// accessible label stays on the surrounding control. Rendered under the New
// Architecture through the legacy view-manager interop layer. The color arrives
// as the theme's CSS string ("#RRGGBB", "#RRGGBBAA" or "rgba(r, g, b, a)")
// because the interop layer does not preserve processColor's channel order.

static UIColor *ChessticizeSymbolColorFromString(NSString *value)
{
  NSString *trimmed = [value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  if ([trimmed hasPrefix:@"#"]) {
    NSString *hex = [trimmed substringFromIndex:1];
    if (hex.length != 6 && hex.length != 8) {
      return nil;
    }
    unsigned long long raw = 0;
    if (![[NSScanner scannerWithString:hex] scanHexLongLong:&raw]) {
      return nil;
    }
    CGFloat alpha = 1;
    if (hex.length == 8) {
      alpha = (raw & 0xFF) / 255.0;
      raw >>= 8;
    }
    return [UIColor colorWithRed:((raw >> 16) & 0xFF) / 255.0
                           green:((raw >> 8) & 0xFF) / 255.0
                            blue:(raw & 0xFF) / 255.0
                           alpha:alpha];
  }
  if ([trimmed hasPrefix:@"rgb"]) {
    NSRange open = [trimmed rangeOfString:@"("];
    NSRange close = [trimmed rangeOfString:@")" options:NSBackwardsSearch];
    if (open.location == NSNotFound || close.location == NSNotFound || close.location <= open.location) {
      return nil;
    }
    NSString *inner = [trimmed substringWithRange:NSMakeRange(open.location + 1, close.location - open.location - 1)];
    NSArray<NSString *> *parts = [inner componentsSeparatedByString:@","];
    if (parts.count < 3) {
      return nil;
    }
    CGFloat alpha = parts.count > 3 ? parts[3].doubleValue : 1;
    return [UIColor colorWithRed:parts[0].doubleValue / 255.0
                           green:parts[1].doubleValue / 255.0
                            blue:parts[2].doubleValue / 255.0
                           alpha:alpha];
  }
  return nil;
}

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

RCT_CUSTOM_VIEW_PROPERTY(symbolColor, NSString, ChessticizeSymbolView)
{
  view.tintColor = [json isKindOfClass:NSString.class] ? ChessticizeSymbolColorFromString(json) : nil;
}

@end
