// The iOS SF Symbol view is a codegen Fabric component (#640) whose spec calls
// react-native's codegenNativeComponent, which react-native-web does not provide.
// The Lab renders Icon through the Material Symbols font path, so this stand-in
// only keeps the spec module loadable on the web and never draws anything.
export default function ChessticizeSymbolView(): null {
  return null;
}
