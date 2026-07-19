import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-native-web-vite";
import { storyNameFromExport, toId } from "storybook/internal/csf";
import type { Indexer } from "storybook/internal/types";
import { mergeConfig } from "vite";
import { newScenarios } from "../src/scenarioRegistry.ts";

const labRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const newScenarioStoryIds = new Set(newScenarios.map((scenario) => scenario.storyId));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-native-web-vite",
    options: {}
  },
  core: {
    disableTelemetry: true
  },
  typescript: {
    reactDocgen: false
  },
  tags: {
    new: {}
  },
  experimental_indexers: (existingIndexers) => {
    const indexers = existingIndexers ?? [];
    const csfIndexer = indexers.find((indexer) => {
      indexer.test.lastIndex = 0;
      return indexer.test.test("Example.stories.tsx");
    });

    if (!csfIndexer) {
      throw new Error("Interaction Lab could not locate Storybook's CSF indexer.");
    }

    const labScenarioIndexer: Indexer = {
      test: /[\\/]src[\\/].*\.stories\.(ts|tsx)$/,
      async createIndex(fileName, options) {
        const entries = await csfIndexer.createIndex(fileName, options);

        return entries.map((entry) => {
          const title = entry.metaId ?? entry.title ?? options.makeTitle();
          const storyId = entry.__id ?? toId(title, storyNameFromExport(entry.exportName));

          if (!newScenarioStoryIds.has(storyId)) {
            return entry;
          }

          return {
            ...entry,
            tags: [...new Set([...(entry.tags ?? []), "new"])]
          };
        });
      }
    };

    return [labScenarioIndexer, ...indexers];
  },
  async viteFinal(currentConfig) {
    return mergeConfig(currentConfig, {
      resolve: {
        alias: [
          {
            find: "react-native-chessboard",
            replacement: fileURLToPath(new URL("../src/BoardPlaceholder.tsx", import.meta.url))
          },
          {
            find: /^.*\/mobilePractice\.ts$/,
            replacement: fileURLToPath(new URL("../src/browserMobilePractice.ts", import.meta.url))
          },
          {
            find: /^.*\/reviewReminderScheduler\.ts$/,
            replacement: fileURLToPath(new URL("../src/browserReviewReminderScheduler.ts", import.meta.url))
          }
        ],
        dedupe: ["react", "react-dom", "react-native", "react-native-web"]
      },
      server: {
        fs: {
          allow: [labRoot, repoRoot]
        }
      }
    });
  }
};

export default config;
