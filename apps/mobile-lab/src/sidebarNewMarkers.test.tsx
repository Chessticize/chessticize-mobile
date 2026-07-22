import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SidebarLabel,
  sidebarItemHasNewMarker,
  type SidebarItem
} from "./sidebarNewMarkers.tsx";

const sidebarItems: Record<string, SidebarItem> = {
  practice: {
    id: "practice",
    name: "Practice",
    tags: [],
    children: ["practice-custom-sprint-setup"]
  },
  "practice-custom-sprint-setup": {
    id: "practice-custom-sprint-setup",
    name: "Custom sprint setup",
    tags: [],
    children: ["practice--custom-setup"]
  },
  "practice--custom-setup": {
    id: "practice--custom-setup",
    name: "Custom sprint setup",
    tags: ["new"]
  },
  review: {
    id: "review",
    name: "Review",
    tags: [],
    children: ["review--due-queue"]
  },
  "review--due-queue": {
    id: "review--due-queue",
    name: "Due queue",
    tags: []
  }
};

const resolveSidebarItem = (id: string) => sidebarItems[id];

test("a new story marks every level of its sidebar path", () => {
  assert.equal(sidebarItemHasNewMarker(sidebarItems["practice--custom-setup"], resolveSidebarItem), true);
  assert.equal(
    sidebarItemHasNewMarker(sidebarItems["practice-custom-sprint-setup"], resolveSidebarItem),
    true
  );
  assert.equal(sidebarItemHasNewMarker(sidebarItems.practice, resolveSidebarItem), true);
});

test("an unrelated sidebar path remains unmarked", () => {
  assert.equal(sidebarItemHasNewMarker(sidebarItems["review--due-queue"], resolveSidebarItem), false);
  assert.equal(sidebarItemHasNewMarker(sidebarItems.review, resolveSidebarItem), false);
});

test("the sidebar label renders a visible new badge only when marked", () => {
  const marked = renderToStaticMarkup(<SidebarLabel name="Practice" isNew />);
  const unmarked = renderToStaticMarkup(<SidebarLabel name="Review" isNew={false} />);

  assert.match(marked, />Practice</);
  assert.match(marked, />new</);
  assert.doesNotMatch(unmarked, />new</);
});
