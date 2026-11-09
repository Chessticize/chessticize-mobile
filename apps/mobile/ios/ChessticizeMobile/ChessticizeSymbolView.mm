#import <React/RCTConversions.h>
#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

#import <react/renderer/components/ChessticizeMobileSpec/ComponentDescriptors.h>
#import <react/renderer/components/ChessticizeMobileSpec/Props.h>
#import <react/renderer/components/ChessticizeMobileSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

// Renders an SF Symbol for the shared JS Icon component (#609) as a codegen Fabric
// component (#640). The typed props come from ChessticizeSymbolViewNativeComponent.ts:
// symbol name, point size, weight and a processed color. The view is decorative, so the
// accessible label stays on the surrounding control.

@interface ChessticizeSymbolView : RCTViewComponentView <RCTChessticizeSymbolViewViewProtocol>
@end

@implementation ChessticizeSymbolView {
  UIImageView *_imageView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ChessticizeSymbolViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ChessticizeSymbolViewProps>();
    _props = defaultProps;

    _imageView = [[UIImageView alloc] initWithFrame:self.bounds];
    _imageView.contentMode = UIViewContentModeCenter;
    _imageView.isAccessibilityElement = NO;
    _imageView.accessibilityElementsHidden = YES;
    self.contentView = _imageView;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldSymbolProps = *std::static_pointer_cast<const ChessticizeSymbolViewProps>(_props);
  const auto &newSymbolProps = *std::static_pointer_cast<const ChessticizeSymbolViewProps>(props);

  if (oldSymbolProps.symbolName != newSymbolProps.symbolName ||
      oldSymbolProps.pointSize != newSymbolProps.pointSize ||
      oldSymbolProps.symbolWeight != newSymbolProps.symbolWeight || _imageView.image == nil) {
    [self updateSymbolWithProps:newSymbolProps];
  }
  if (oldSymbolProps.symbolColor != newSymbolProps.symbolColor) {
    _imageView.tintColor = RCTUIColorFromSharedColor(newSymbolProps.symbolColor);
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)updateSymbolWithProps:(const ChessticizeSymbolViewProps &)props
{
  if (props.symbolName.empty()) {
    _imageView.image = nil;
    return;
  }
  UIImageSymbolWeight weight = UIImageSymbolWeightRegular;
  switch (props.symbolWeight) {
    case ChessticizeSymbolViewSymbolWeight::Semibold:
      weight = UIImageSymbolWeightSemibold;
      break;
    case ChessticizeSymbolViewSymbolWeight::Bold:
      weight = UIImageSymbolWeightBold;
      break;
    case ChessticizeSymbolViewSymbolWeight::Regular:
      break;
  }
  UIImageSymbolConfiguration *configuration =
      [UIImageSymbolConfiguration configurationWithPointSize:(props.pointSize > 0 ? props.pointSize : 17)
                                                      weight:weight
                                                       scale:UIImageSymbolScaleMedium];
  _imageView.image = [UIImage systemImageNamed:RCTNSStringFromString(props.symbolName)
                             withConfiguration:configuration];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  static const auto defaultProps = std::make_shared<const ChessticizeSymbolViewProps>();
  _props = defaultProps;
  _imageView.image = nil;
  _imageView.tintColor = nil;
}

@end
