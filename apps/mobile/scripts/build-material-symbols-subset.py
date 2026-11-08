"""Build the bundled Material Symbols subset used by Icon on Android and in the Lab.

Usage (with fontTools installed in any Python environment):

  python3 apps/mobile/scripts/build-material-symbols-subset.py \
    path/to/MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf \
    path/to/MaterialSymbolsRounded[FILL,GRAD,opsz,wght].codepoints

Source: https://github.com/google/material-design-icons/tree/master/variablefont
(Apache License 2.0). The script pins the variable axes to the outlined, regular
weight, 24 dp optical size, keeps only the glyphs named in
apps/mobile/src/components/ui/iconNames.ts, and writes
apps/mobile/android/app/src/main/assets/fonts/ChessticizeSymbols.ttf.
"""

import pathlib
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[1]
NAMES_FILE = ROOT / "src/components/ui/iconNames.ts"
OUTPUT = ROOT / "android/app/src/main/assets/fonts/ChessticizeSymbols.ttf"
FAMILY = "ChessticizeSymbols"


def material_names() -> list[str]:
    source = NAMES_FILE.read_text()
    return sorted(set(re.findall(r'material:\s*"([a-z0-9_]+)"', source)))


def main() -> None:
    font_path, codepoints_path = sys.argv[1], sys.argv[2]
    codepoints = {}
    for line in pathlib.Path(codepoints_path).read_text().splitlines():
        name, value = line.split()
        codepoints[name] = int(value, 16)
    names = material_names()
    missing = [name for name in names if name not in codepoints]
    if missing:
        raise SystemExit(f"Unknown Material Symbols: {missing}")

    font = TTFont(font_path)
    font = instancer.instantiateVariableFont(font, {"FILL": 0, "GRAD": 0, "opsz": 24, "wght": 400})
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[codepoints[name] for name in names])
    subsetter.subset(font)

    name_table = font["name"]
    for record in list(name_table.names):
        if record.nameID in (1, 4, 16, 21):
            name_table.setName(FAMILY, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == 6:
            name_table.setName(FAMILY + "-Regular", record.nameID, record.platformID, record.platEncID, record.langID)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUTPUT)
    print(f"Wrote {OUTPUT} with {len(names)} glyphs: {', '.join(names)}")


if __name__ == "__main__":
    main()
