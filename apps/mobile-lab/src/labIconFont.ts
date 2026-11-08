import { ICON_FONT_FAMILY } from "../../mobile/src/components/ui/Icon.tsx";
import iconFontUrl from "../../mobile/android/app/src/main/assets/fonts/ChessticizeSymbols.ttf?url";

// The shared Icon draws Material Symbols glyphs from the bundled subset font on
// Android and in the Lab (SF Symbols are iOS-only). Android loads the font from
// its assets; the Lab registers the same file here.
export function installLabIconFont(): void {
  if (typeof document === "undefined" || document.getElementById("chessticize-icon-font")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "chessticize-icon-font";
  style.textContent = `@font-face { font-family: "${ICON_FONT_FAMILY}"; src: url("${iconFontUrl}") format("truetype"); font-display: block; }`;
  document.head.appendChild(style);
}
