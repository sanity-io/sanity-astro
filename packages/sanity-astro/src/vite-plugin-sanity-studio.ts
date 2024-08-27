import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

export function vitePluginSanityStudio(resolvedOptions: {studioBasePath?: string}) {
  const virtualModuleId = 'sanity:studio'
  const resolvedVirtualModuleId = virtualModuleId

  return {
    name: 'sanity:studio',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      return null
    },
    async load(id: string) {
      if (id === virtualModuleId) {
        const studioConfig = await this.resolve('/sanity.config')
        if (!studioConfig) {
          throw new Error(
            '[@sanity/astro]: Sanity Studio requires a `sanity.config.ts|js` file in your project root.',
          )
        }
        const studioBasePath = resolvedOptions.studioBasePath || ''
        return `
        import studioConfig from "${studioConfig.id}";

        if (studioConfig.basePath && studioConfig.basePath !== "${studioBasePath}") {
          console.warn(
            "[@sanity/astro]: The basePath setting in sanity.config.ts|js differs from the studioBasePath option in astro.config.mjs. The studioBasePath option will
        `
      }
      return null
    },
  } satisfies PartialDeep<PluginOption>
}
