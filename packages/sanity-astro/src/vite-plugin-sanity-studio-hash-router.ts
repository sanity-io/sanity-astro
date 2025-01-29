import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

export function vitePluginSanityStudioHashRouter() {
  const virtualModuleId = 'sanity:studio-hash-router'
  const resolvedVirtualModuleId = virtualModuleId

  return {
    name: 'sanity:studio-hash-router',
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

        return `export {default} from "${studioConfig.id}";`
      }
      return null
    },
  } satisfies PartialDeep<PluginOption>
}
