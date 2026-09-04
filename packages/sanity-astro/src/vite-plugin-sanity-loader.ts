import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:loader'
export const SANITY_LOADER_MODULE_ID = '\0' + virtualModuleId

export interface SanityLoaderModuleHost {
  getSource(): string | undefined
}

const missingLiveOption = `throw new Error(${JSON.stringify(
  '[@sanity/astro] Import of "sanity:loader" requires the `live` option in astro.config. See https://github.com/sanity-io/sanity-astro#live-collections',
)})\n`

export function vitePluginSanityLoader(host: SanityLoaderModuleHost) {
  return {
    name: 'sanity:loader',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return SANITY_LOADER_MODULE_ID
      }
    },
    load(id: string) {
      if (id === SANITY_LOADER_MODULE_ID) {
        return host.getSource() ?? missingLiveOption
      }
    },
  } satisfies PartialDeep<PluginOption>
}
