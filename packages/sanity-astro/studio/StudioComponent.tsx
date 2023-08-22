import React from "react";
import { Studio } from "sanity";
import { useTheme } from "./useTheme";

// @ts-ignore
import config from "virtual:sanity-studio";
import { usePrefersColorScheme } from "./usePrefersColorScheme";

if (!config) {
  throw new Error(
    "Can't load Sanity Studio. Check that you've configured it in `sanity.config.js|ts`."
  );
}

export default function StudioComponent() {
  const theme = useTheme(config);
  const scheme = usePrefersColorScheme();

  return (
    <div
      data-ui="NextStudioLayout"
      style={{
        height: "100vh",
        maxHeight: "100dvh",
        overscrollBehavior: "none",
        WebkitFontSmoothing: "antialiased",
        overflow: "hidden",
        fontFamily: theme.fonts.text.family,
        backgroundColor:
          theme.color[scheme === "dark" ? "dark" : "light"].default.base.bg,
      }}
    >
      <Studio config={config} />;
    </div>
  );
}
