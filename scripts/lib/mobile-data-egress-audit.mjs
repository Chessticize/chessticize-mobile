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
    // Native tab host (#612). Reviewed: no network APIs in its JS or native code.
    "react-native-screens",
    "react-native-worklets"
  ])
});

const FIRST_PARTY_RUNTIME_TREES = Object.freeze([
  "apps/mobile/src",
  "apps/mobile/android/app/src/main",
  "apps/mobile/ios",
  "apps/mobile/native",
  "packages/core/src",
  "packages/storage/src"
]);

const APPLICATION_ENTRYPOINT_DIRECTORY = "apps/mobile";

const EXCLUDED_RUNTIME_DIRECTORY_NAMES = new Set([
  ".gradle",
  "__mocks__",
  "__tests__",
  "androidtest",
  "artifacts",
  "build",
  "deriveddata",
  "e2e",
  "generated",
  "node_modules",
  "pods",
  "scripts",
  "test",
  "test-support",
  "tests",
  "vendor"
]);

const EXCLUDED_RUNTIME_TREE_PREFIXES = Object.freeze([
  // The shared Stockfish tree is vendored upstream engine source. First-party
  // platform bridges remain covered under android/app/src/main and ios/.
  "apps/mobile/native/stockfish"
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

export const ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH =
  "apps/mobile/src/platform/publicGameImportClient.ts";

export const APPROVED_PUBLIC_GAME_IMPORT_HOSTS = Object.freeze([
  "api.chess.com",
  "lichess.org"
]);

const APPROVED_PUBLIC_GAME_IMPORT_HOST_SET = new Set(APPROVED_PUBLIC_GAME_IMPORT_HOSTS);

const APPROVED_PUBLIC_GAME_IMPORT_PATH_PREFIXES = new Set([
  "/pub/",
  "/api/"
]);

const NETWORK_PRIMITIVES = Object.freeze([
  { id: "fetch", label: "JavaScript fetch API", pattern: /\bfetch\s*\(/u },
  { id: "browser-transport", label: "JavaScript browser transport", pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/u },
  { id: "beacon", label: "JavaScript beacon transport", pattern: /\bnavigator\s*\.\s*sendBeacon\s*\(/u },
  {
    id: "node-network",
    label: "Node network module",
    pattern: /(?:from\s*|require\s*\(\s*|import\s*\(\s*)["'](?:node:)?(?:http|https|net|tls|dgram)(?:\/[^"']*)?["']/u
  },
  { id: "android-network", label: "Android network API", pattern: /\b(?:java\.net|javax\.net|HttpURLConnection|HttpsURLConnection|Socket|DatagramSocket)\b/u },
  { id: "apple-network", label: "Apple network API", pattern: /\b(?:NSURLSession|URLSession|NSURLConnection|CFHTTPMessage|NWConnection)\b/u }
]);

export function auditMobileDataEgress({ repoRoot }) {
  const findings = [];
  const scannedFiles = runtimeSourceFiles(repoRoot);

  for (const path of scannedFiles) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    const isAllowlistedImportClient = path === ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH;

    for (const primitive of NETWORK_PRIMITIVES) {
      if (isAllowlistedImportClient && primitive.id === "fetch") {
        continue;
      }
      if (primitive.pattern.test(source)) {
        findings.push({
          kind: "network-primitive",
          path,
          detail: primitive.label
        });
      }
    }

    if (isAllowlistedImportClient) {
      auditPublicGameImportClientSource({ source, path, findings });
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

function auditPublicGameImportClientSource({ source, path, findings }) {
  const code = stripJsComments(source);
  const requiredChecks = [
    {
      pattern: /["']https:["']/u,
      detail: "Public game import client must enforce HTTPS protocol validation"
    },
    {
      pattern: /["']api\.chess\.com["']/u,
      detail: "Public game import client must explicitly allowlist api.chess.com"
    },
    {
      pattern: /["']\/pub\/["']/u,
      detail: "Public game import client must restrict api.chess.com requests to /pub/"
    },
    {
      pattern: /["']lichess\.org["']/u,
      detail: "Public game import client must explicitly allowlist lichess.org"
    },
    {
      pattern: /["']\/api\/["']/u,
      detail: "Public game import client must restrict lichess.org requests to /api/"
    },
    {
      pattern: /\bcredentials\s*:\s*["']omit["']/u,
      detail: "Public game import client must enforce credentials: \"omit\""
    },
    {
      pattern: /["']disallowed_host["']/u,
      detail: "Public game import client must fail closed with disallowed_host"
    }
  ];

  for (const check of requiredChecks) {
    if (!check.pattern.test(code)) {
      findings.push({
        kind: "egress-allowlist",
        path,
        detail: check.detail
      });
    }
  }

  if (/\bcredentials\s*:\s*["'](?:include|same-origin)["']/u.test(code)) {
    findings.push({
      kind: "egress-allowlist",
      path,
      detail: "Public game import client must not send credentials or cookies"
    });
  }

  for (const match of code.matchAll(/\bhostname\s*:\s*["']([^"']+)["']/gu)) {
    const host = match[1]?.toLowerCase();
    if (host && !APPROVED_PUBLIC_GAME_IMPORT_HOST_SET.has(host)) {
      findings.push({
        kind: "egress-allowlist",
        path,
        detail: `Unapproved public game import host in allowlist: ${host}`
      });
    }
  }

  for (const match of code.matchAll(/\bpathPrefix\s*:\s*["']([^"']+)["']/gu)) {
    const prefix = match[1];
    if (prefix && !APPROVED_PUBLIC_GAME_IMPORT_PATH_PREFIXES.has(prefix)) {
      findings.push({
        kind: "egress-allowlist",
        path,
        detail: `Unapproved public game import path prefix in allowlist: ${prefix}`
      });
    }
  }

  for (const match of code.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/gu)) {
    const host = match[1]?.toLowerCase();
    if (host && !APPROVED_PUBLIC_GAME_IMPORT_HOST_SET.has(host)) {
      findings.push({
        kind: "egress-allowlist",
        path,
        detail: `Unapproved URL host in public game import client: ${host}`
      });
    }
  }
}

function stripJsComments(source) {
  let output = "";
  let index = 0;
  let quote = null;

  while (index < source.length) {
    const ch = source[index];
    const next = source[index + 1];

    if (quote !== null) {
      output += ch;
      if (ch === "\\" && index + 1 < source.length) {
        output += next;
        index += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      output += ch;
      index += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      index += 2;
      while (index + 1 < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    output += ch;
    index += 1;
  }

  return output;
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
  return [...new Set([
    ...collectApplicationEntrypointFiles(repoRoot),
    ...FIRST_PARTY_RUNTIME_TREES.flatMap((path) => collectRuntimeSourceFiles(repoRoot, path))
  ])]
    .sort((left, right) => left.localeCompare(right));
}

function collectApplicationEntrypointFiles(repoRoot) {
  const absolutePath = join(repoRoot, APPLICATION_ENTRYPOINT_DIRECTORY);
  if (!existsSync(absolutePath)) {
    return [];
  }
  return readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${APPLICATION_ENTRYPOINT_DIRECTORY}/${entry.name}`)
    .filter(isRuntimeSource);
}

function collectRuntimeSourceFiles(repoRoot, relativePath) {
  if (isExcludedRuntimePath(relativePath)) {
    return [];
  }
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
  if (isExcludedRuntimePath(path) || isTestOrToolingSource(path)) {
    return false;
  }
  const dot = path.lastIndexOf(".");
  return dot >= 0 && RUNTIME_SOURCE_EXTENSIONS.has(path.slice(dot));
}

function isExcludedRuntimePath(path) {
  const normalizedPath = path.split(sep).join("/");
  if (EXCLUDED_RUNTIME_TREE_PREFIXES.some((prefix) =>
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  )) {
    return true;
  }
  return normalizedPath.split("/").some((segment) =>
    EXCLUDED_RUNTIME_DIRECTORY_NAMES.has(segment.toLowerCase())
  );
}

function isTestOrToolingSource(path) {
  const name = path.split("/").at(-1) ?? "";
  return name.startsWith(".") ||
    /\.(?:config|env|setup)\.[^.]+$/u.test(name) ||
    /\.(?:spec|test)\.[^.]+$/u.test(name);
}
