import React, { type ReactElement } from "react";

export type SidebarItem = {
  id: string;
  name: string;
  tags: readonly string[];
  children?: readonly string[];
};

type ResolveSidebarItem = (id: string) => SidebarItem | undefined;

export function sidebarItemHasNewMarker(
  item: SidebarItem,
  resolveItem: ResolveSidebarItem,
  visited: ReadonlySet<string> = new Set()
): boolean {
  if (item.tags.includes("new")) {
    return true;
  }

  if (!item.children?.length || visited.has(item.id)) {
    return false;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(item.id);

  return item.children.some((childId) => {
    const child = resolveItem(childId);
    return child ? sidebarItemHasNewMarker(child, resolveItem, nextVisited) : false;
  });
}

export function SidebarLabel({ name, isNew }: { name: string; isNew: boolean }): ReactElement {
  return (
    <span
      style={{
        alignItems: "center",
        display: "inline-flex",
        gap: 6,
        maxWidth: "100%",
        minWidth: 0
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {name}
      </span>
      {isNew ? (
        <span
          aria-label="new"
          style={{
            backgroundColor: "#e8f7ff",
            border: "1px solid #8dd7f7",
            borderRadius: 999,
            color: "#0679b9",
            flex: "0 0 auto",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0,
            lineHeight: "14px",
            padding: "0 5px",
            textTransform: "lowercase"
          }}
        >
          new
        </span>
      ) : null}
    </span>
  );
}
