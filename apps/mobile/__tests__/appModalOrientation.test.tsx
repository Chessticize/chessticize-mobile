import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AppModal, MODAL_SUPPORTED_ORIENTATIONS } from "../src/components/AppModal";

// React Native's iOS Modal defaults to portrait only. Over a landscape iPad
// window that rotates the app, and in a landscape-only window UIKit throws, so
// every Modal goes through AppModal, which allows every orientation.

const sourceRoot = join(__dirname, "..", "src");
const appModalPath = join("components", "AppModal.tsx");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(js|jsx|ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

describe("Modal orientation guard", () => {
  it("routes every Modal in the app source through AppModal", () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((file) => relative(sourceRoot, file) !== appModalPath)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        const reactNativeImports = source.match(/import\s*(?:type\s*)?\{[^}]*\}\s*from\s*"react-native"/g) ?? [];
        const importsModal = reactNativeImports.some((statement) => /\bModal\b/.test(statement));
        const rendersModal = /<Modal[\s>/]/.test(source) || /\bRN\.Modal\b|ReactNative\.Modal\b/.test(source);
        return importsModal || rendersModal;
      })
      .map((file) => relative(sourceRoot, file));
    expect(offenders).toEqual([]);
  });

  it("finds the app's Modals in the guarded source", () => {
    const users = sourceFiles(sourceRoot)
      .filter((file) => /<AppModal[\s>]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(sourceRoot, file))
      .sort();
    expect(users).toEqual([
      join("components", "ICloudSyncErrorDetails.tsx"),
      join("components", "WhatsNewSheet.tsx"),
      join("components", "practice", "home", "PracticeHome.tsx"),
      join("components", "practice", "review", "ReviewSession.tsx"),
      join("components", "practice", "settings", "SettingsPanel.tsx")
    ]);
  });

  it("gives the native Modal every orientation the app's windows can take", () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <AppModal transparent visible>
          <Text>Body</Text>
        </AppModal>
      );
    });
    // The Jest mock renders React Native's Modal as a host element named "Modal".
    const modal = renderer!.root.find((node) => String(node.type) === "Modal");
    expect(modal.props.supportedOrientations).toBe(MODAL_SUPPORTED_ORIENTATIONS);
    expect(MODAL_SUPPORTED_ORIENTATIONS).toEqual(
      expect.arrayContaining(["portrait", "portrait-upside-down", "landscape-left", "landscape-right"])
    );
    expect(modal.props.transparent).toBe(true);
  });
});
