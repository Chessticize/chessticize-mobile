import React from "react";
import { addons } from "storybook/manager-api";
import {
  SidebarLabel,
  sidebarItemHasNewMarker,
  type SidebarItem
} from "../src/sidebarNewMarkers.tsx";

addons.setConfig({
  sidebar: {
    renderLabel(item, api) {
      const isNew = sidebarItemHasNewMarker(item, (id) =>
        api.resolveStory(id, item.refId) as SidebarItem | undefined
      );

      return <SidebarLabel name={item.name} isNew={isNew} />;
    }
  }
});
