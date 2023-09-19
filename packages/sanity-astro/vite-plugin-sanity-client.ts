import type { ClientConfig } from "@sanity/client";
import type { Plugin } from "vite";

const virtualModuleId = "sanity:client";
const resolvedVirtualModuleId = "\0" + virtualModuleId;

export function vitePluginSanityClient(config: ClientConfig): Plugin {
  return {
    name: "vite-plugin-sanity-client",
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          import { createClient } from "@sanity/client";
          export const sanityClient = createClient(
            ${JSON.stringify(config)}
          );
        `;
      }
    },
  };
}
