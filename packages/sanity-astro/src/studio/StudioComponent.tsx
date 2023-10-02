import React from "react";
// @ts-ignore
import { config } from "sanity:studio";
import { Studio } from "sanity";

// import { useTheme } from "./useTheme";
//import { usePrefersColorScheme } from "./usePrefersColorScheme";

if (!config) {
  throw new Error(
    "[@sanity/astro]: Can't load Sanity Studio. Check that you've configured it in `sanity.config.js|ts`.",
  );
}

export function StudioComponent() {
  /* Disabled for now */
  // const theme = useTheme(config);
  // const scheme = usePrefersColorScheme();

  return (
    <div
      data-ui="NextStudioLayout"
      style={{
        height: "100vh",
        maxHeight: "100dvh",
        overscrollBehavior: "none",
        WebkitFontSmoothing: "antialiased",
        overflow: "hidden",
        //fontFamily: theme.fonts.text.family,
        //backgroundColor:
        //  theme.color[scheme === "dark" ? "dark" : "light"].default.base.bg,
      }}
    >
      <Studio config={config} />;
    </div>
  );
}
