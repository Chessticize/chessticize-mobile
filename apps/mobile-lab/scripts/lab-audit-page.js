// Evaluated inside the Lab page by visual-regression.ts (kept as plain JavaScript so no
// transpiler helper is injected). Flags text below WCAG AA against its effective background
// and large opaque pure white or black surfaces that a dark theme should not have.
(() => {
  const parse = (value) => {
    const match = /rgba?\(([^)]+)\)/.exec(value);
    if (!match) return undefined;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] === undefined ? 1 : parts[3]];
  };
  const luminance = (rgb) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const effectiveBackground = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color[3] > 0) layers.push(color);
      if (color && color[3] >= 1) break;
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    let result = root && root[3] > 0 ? root : [255, 255, 255, 1];
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };
  const chrome = ".lab-device-status-bar, .lab-toolbar";
  const issues = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent && node.textContent.trim();
    const element = node.parentElement;
    if (!text || !element || element.closest(chrome)) continue;
    // Coordinates sit in an overlay above the board squares, so their real background is a
    // sibling layer this walk cannot see; the board contrast is covered by themeContrast.test.
    if (element.closest("[data-testid^=\"board-coordinate\"]")) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const foreground = parse(style.color);
    if (!foreground) continue;
    const background = effectiveBackground(element);
    const flat = foreground[3] < 1 ? over(foreground, background) : foreground;
    const pair = [luminance(flat), luminance(background)].sort((a, b) => b - a);
    const ratio = (pair[0] + 0.05) / (pair[1] + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      const holder = element.closest("[data-testid]");
      const id = holder ? holder.getAttribute("data-testid") : "";
      const key = id + "|" + text.slice(0, 24);
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          kind: "text",
          detail: '"' + text.slice(0, 32) + '" ' + ratio.toFixed(1) + ":1 " + style.color
            + " on rgb(" + background.slice(0, 3).map(Math.round).join(",") + ") [" + id + "]"
        });
      }
    }
  }
  if (document.documentElement.dataset.labTheme === "dark") {
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      if (element.closest(chrome)) continue;
      const color = parse(getComputedStyle(element).backgroundColor);
      const rect = element.getBoundingClientRect();
      const white = color && color[0] === 255 && color[1] === 255 && color[2] === 255;
      const black = color && color[0] === 0 && color[1] === 0 && color[2] === 0;
      if (color && color[3] >= 1 && rect.width * rect.height > 1500 && (white || black)) {
        const holder = element.closest("[data-testid]");
        issues.push({
          kind: "surface",
          detail: "pure " + (white ? "white" : "black") + " surface " + Math.round(rect.width) + "x"
            + Math.round(rect.height) + " [" + (holder ? holder.getAttribute("data-testid") : "") + "]"
        });
      }
    }
  }
  return issues;
})()
