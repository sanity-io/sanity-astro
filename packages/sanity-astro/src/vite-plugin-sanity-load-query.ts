import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:load-query'
const resolvedVirtualModuleId = '\0' + virtualModuleId

export function vitePluginSanityLoadQuery() {
  return {
    name: 'sanity:load-query',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          import {sanityClient} from "sanity:client";
          import {sanityVisualEditing} from "sanity:visual-editing";
          import {isDraftMode, resolvePreviewModeConfig} from "@sanity/astro/visual-editing";

          export async function loadQuery({
            query,
            params,
            cookies,
          }) {
            const previewMode = resolvePreviewModeConfig(sanityVisualEditing.previewMode);
            const draftModeOptions = previewMode
              ? {
                  cookieName: previewMode.cookie,
                  ...(sanityVisualEditing.previewModeId
                    ? {cookieValue: sanityVisualEditing.previewModeId}
                    : {}),
                }
              : undefined;

            const visualEditingEnabled = previewMode
              ? isDraftMode(cookies, draftModeOptions)
              : false;

            const envToken =
              import.meta.env.SANITY_API_READ_TOKEN ||
              (typeof process !== "undefined" ? process.env?.SANITY_API_READ_TOKEN : undefined);
            const token = sanityVisualEditing.token || envToken;

            if (visualEditingEnabled && !token) {
              throw new Error(
                "The \`SANITY_API_READ_TOKEN\` environment variable is required in Draft Mode.",
              );
            }

            const perspective = visualEditingEnabled ? "drafts" : "published";
            const useCdn = visualEditingEnabled ? false : sanityClient.config().useCdn ?? true;

            const {result, resultSourceMap} = await sanityClient.fetch(
              query,
              params ?? {},
              {
                filterResponse: false,
                perspective,
                resultSourceMap: visualEditingEnabled ? "withKeyArraySelector" : false,
                stega: visualEditingEnabled,
                ...(visualEditingEnabled ? {token} : {}),
                useCdn,
              },
            );

            return {
              data: result,
              sourceMap: resultSourceMap,
              perspective,
            };
          }
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
