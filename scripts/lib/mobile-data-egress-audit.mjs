import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const APPROVED_RUNTIME_DEPENDENCIES = Object.freeze({
  ".": Object.freeze([
    "chess.js"
  ]),
  "apps/mobile": Object.freeze([
    "@op-engineering/op-sqlite",
    "@shopify/react-native-skia",
    "react",
    "react-native",
    "react-native-chessboard",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-safe-area-context",
    "react-native-worklets"
  ])
});

const FIRST_PARTY_RUNTIME_ROOTS = Object.freeze([
  "apps/mobile/App.tsx",
  "apps/mobile/src",
  "apps/mobile/android/app/src/main",
  "apps/mobile/ios/ChessticizeMobile",
  "packages/core/src",
  "packages/storage/src"
]);

const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".m",
  ".mm",
  ".swift",
  ".ts",
  ".tsx"
]);

const NETWORK_PRIMITIVES = Object.freeze([
  { label: "JavaScript fetch API", pattern: /\bfetch\s*\(/u },
  { label: "JavaScript browser transport", pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/u },
  { label: "JavaScript beacon transport", pattern: /\bnavigator\s*\.\s*sendBeacon\s*\(/u },
  {
    label: "Node network module",
    pattern: /(?:from\s*|require\s*\(\s*|import\s*\(\s*)["'](?:node:)?(?:http|https|net|tls|dgram)(?:\/[^"']*)?["']/u
  },
  { label: "Android network API", pattern: /\b(?:java\.net|javax\.net|HttpURLConnection|HttpsURLConnection|Socket|DatagramSocket)\b/u },
  { label: "Apple network API", pattern: /\b(?:NSURLSession|URLSession|NSURLConnection|CFHTTPMessage|NWConnection)\b/u }
]);

export function auditMobileDataEgress({ repoRoot }) {
  const findings = [];
  const scannedFiles = runtimeSourceFiles(repoRoot);

  for (const path of scannedFiles) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    for (const primitive of NETWORK_PRIMITIVES) {
      if (primitive.pattern.test(source)) {
        findings.push({
          kind: "network-primitive",
          path,
          detail: primitive.label
        });
      }
    }
  }

  const packageDependencies = {
    ".": dependencyNames(readJson(join(repoRoot, "package.json"))),
    "apps/mobile": dependencyNames(readJson(join(repoRoot, "apps/mobile/package.json")))
  };
  const lockfile = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8");

  for (const importer of Object.keys(APPROVED_RUNTIME_DEPENDENCIES)) {
    const approved = APPROVED_RUNTIME_DEPENDENCIES[importer];
    recordDependencyDrift({
      actual: packageDependencies[importer],
      approved,
      findings,
      path: importer === "." ? "package.json" : `${importer}/package.json`
    });
    recordDependencyDrift({
      actual: extractImporterDependencyNames(lockfile, importer),
      approved,
      findings,
      path: "pnpm-lock.yaml",
      context: `importer ${importer}`
    });
  }

  return {
    status: findings.length === 0 ? "pass" : "fail",
    summary: {
      scannedFiles: scannedFiles.length,
      approvedRuntimeDependencies: Object.values(APPROVED_RUNTIME_DEPENDENCIES)
        .reduce((count, dependencies) => count + dependencies.length, 0),
      failed: findings.length
    },
    findings
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function dependencyNames(packageJson) {
  return Object.keys(packageJson.dependencies ?? {}).sort();
}

function recordDependencyDrift({ actual, approved, findings, path, context = "runtime dependencies" }) {
  const approvedSet = new Set(approved);
  const actualSet = new Set(actual);
  for (const dependency of actual.filter((name) => !approvedSet.has(name))) {
    findings.push({
      kind: "runtime-dependency",
      path,
      detail: `Unreviewed ${context}: ${dependency}`
    });
  }
  for (const dependency of approved.filter((name) => !actualSet.has(name))) {
    findings.push({
      kind: "runtime-dependency",
      path,
      detail: `Approved ${context} missing from current state: ${dependency}`
    });
  }
}

function extractImporterDependencyNames(lockfile, importer) {
  const lines = lockfile.split(/\r?\n/u);
  const importerHeader = `  ${importer}:`;
  const dependencies = [];
  let inImporter = false;
  let inDependencies = false;

  for (const line of lines) {
    if (!inImporter) {
      if (line === importerHeader) {
        inImporter = true;
      }
      continue;
    }
    if (/^  \S.*:\s*$/u.test(line)) {
      break;
    }
    if (line === "    dependencies:") {
      inDependencies = true;
      continue;
    }
    if (inDependencies && /^    \S/u.test(line)) {
      break;
    }
    if (!inDependencies) {
      continue;
    }
    const match = line.match(/^      (.+):$/u);
    if (match) {
      dependencies.push(unquoteYamlKey(match[1]));
    }
  }
  return dependencies.sort();
}

function unquoteYamlKey(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function runtimeSourceFiles(repoRoot) {
  return FIRST_PARTY_RUNTIME_ROOTS.flatMap((path) => collectRuntimeSourceFiles(repoRoot, path))
    .sort((left, right) => left.localeCompare(right));
}

function collectRuntimeSourceFiles(repoRoot, relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return [];
  }
  if (!statSync(absolutePath).isDirectory()) {
    return isRuntimeSource(relativePath) ? [relativePath] : [];
  }
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(absolutePath, entry.name);
    const childRelativePath = relative(repoRoot, childPath).split(sep).join("/");
    if (entry.isDirectory()) {
      return collectRuntimeSourceFiles(repoRoot, childRelativePath);
    }
    return entry.isFile() && isRuntimeSource(childRelativePath) ? [childRelativePath] : [];
  });
}

function isRuntimeSource(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && RUNTIME_SOURCE_EXTENSIONS.has(path.slice(dot));
}
