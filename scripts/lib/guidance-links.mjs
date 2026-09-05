import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Check inline local links in guidance entry points. Policy wording and heading
// names are intentionally not an executable contract. This is not a Markdown
// parser or a remote URL checker.
export function validateGuidanceLinks(root, documents) {
  const findings = [];
  for (const document of documents) {
    const source = path.resolve(root, document);
    if (!existsSync(source) || !statSync(source).isFile()) {
      findings.push(`${document}: missing guidance document`);
      continue;
    }
    const prose = readFileSync(source, "utf8").replace(/```[^\n]*\n[\s\S]*?```/g, "");
    for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
      const file = decodeURIComponent(target.split("#")[0]);
      const resolved = path.resolve(path.dirname(source), file);
      if (!existsSync(resolved)) findings.push(`${document}: missing local link ${target}`);
    }
  }
  return findings;
}
