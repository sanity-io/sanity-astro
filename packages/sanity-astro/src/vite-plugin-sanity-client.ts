import type {ClientConfig} from '@sanity/client'
import type {PartialDeep} from 'type-fest'
import serialize from 'serialize-javascript'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:client'
const resolvedVirtualModuleId = '\0' + virtualModuleId

export function vitePluginSanityClient(config: ClientConfig) {
  return {
    name: 'sanity:client',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          import { createClient } from "@sanity/client";
          export const sanityClient = createClient(
            ${serialize(config)}
          );
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
