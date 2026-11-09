import { codegenNativeComponent } from "react-native";
import type { CodegenTypes as CT, ColorValue, HostComponent, ViewProps } from "react-native";

// Codegen spec for the iOS SF Symbol view behind the shared Icon (#609, #640).
// Fabric renders it natively; Android and the web Lab never load this module.
export interface NativeProps extends ViewProps {
  symbolName: string;
  pointSize?: CT.WithDefault<CT.Float, 17>;
  symbolWeight?: CT.WithDefault<"regular" | "semibold" | "bold", "regular">;
  symbolColor?: ColorValue;
}

export default codegenNativeComponent<NativeProps>("ChessticizeSymbolView") as HostComponent<NativeProps>;
