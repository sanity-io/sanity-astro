import type { ClientConfig } from "@sanity/client";
import type { Plugin } from "vite";

export function vitePluginSanityInit(config: ClientConfig): Plugin {
  const virtualModuleId = "virtual:sanity-init";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "vite-plugin-sanity-init",
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          import { createClient } from "@sanity/client";
          export const sanityClientInstance = createClient(
            ${JSON.stringify(config)}
          );
        `;
      }
    },
  };
}
