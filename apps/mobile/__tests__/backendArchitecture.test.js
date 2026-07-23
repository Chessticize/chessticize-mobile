const { readFileSync, readdirSync } = require("node:fs");
const { resolve } = require("node:path");

describe("mobile backend/domain architecture", () => {
  it("keeps React, native platform, navigation, and presentation imports outside the backend seam", () => {
    const backendDirectory = resolve(__dirname, "../src/backend");
    const backendFiles = readdirSync(backendDirectory)
      .filter((file) => file.endsWith(".ts"))
      .sort();

    expect(backendFiles.length).toBeGreaterThan(0);
    for (const file of backendFiles) {
      const source = readFileSync(resolve(backendDirectory, file), "utf8");
      expect(source).not.toMatch(/from\s+["']react(?:-native)?(?:["'/])/);
      expect(source).not.toMatch(/require\(["']react(?:-native)?(?:["'/])/);
      expect(source).not.toMatch(/from\s+["'][^"']*\/components(?:\/|["'])/);
      expect(source).not.toMatch(/from\s+["'][^"']*\/navigation(?:\/|["'])/);
    }
  });
});
