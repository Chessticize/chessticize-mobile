import { createHash } from "node:crypto";

const stylesheetHref = /(<link\b[^>]*\bhref=")([^"?#]*styles\.css)(")/g;

export function contentVersion(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function fingerprintStylesheetLinks(html, version) {
  return html.replace(
    stylesheetHref,
    (_match, before, href, after) => `${before}${href}?v=${version}${after}`,
  );
}
