import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatsNewIndex } from "./WhatsNew.stories.tsx";
import { scenarioRegistry, type NewScenarioDefinition } from "./scenarioRegistry.ts";

test("What's New renders the baseline empty state and issue-owned scenario links", () => {
  const emptyHtml = renderToStaticMarkup(<WhatsNewIndex scenarios={[]} />);
  assert.match(emptyHtml, /No scenarios are marked new for an open issue\./);

  const markedScenario = {
    ...scenarioRegistry["practice-home"],
    isNew: true,
    issues: [
      { issueNumber: 245, changeNote: "Try multiple theme selection." },
      { issueNumber: 246, changeNote: "Name the saved run." }
    ]
  } satisfies NewScenarioDefinition;
  const markedHtml = renderToStaticMarkup(<WhatsNewIndex scenarios={[markedScenario]} />);

  assert.match(
    markedHtml,
    /href="https:\/\/github\.com\/Chessticize\/chessticize-mobile\/issues\/245"/
  );
  assert.match(markedHtml, /Issue #245/);
  assert.match(
    markedHtml,
    /href="https:\/\/github\.com\/Chessticize\/chessticize-mobile\/issues\/246"/
  );
  assert.match(markedHtml, /Issue #246/);
  assert.match(markedHtml, /href="\.\/iframe\.html\?id=practice--home&amp;viewMode=story"/);
  assert.match(markedHtml, /Try multiple theme selection\./);
  assert.match(markedHtml, /Name the saved run\./);
});
