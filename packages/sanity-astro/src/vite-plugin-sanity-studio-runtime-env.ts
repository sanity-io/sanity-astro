import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

import {type RuntimeEnvOption, runtimeEnvModuleCode} from './runtime-env'

export function vitePluginSanityStudioRuntimeEnv(env: RuntimeEnvOption | undefined) {
  const virtualModuleId = 'sanity:studio-runtime-env'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  return {
    name: 'sanity:studio-runtime-env',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      return null
    },
    load(id: string, loadOptions?: {ssr?: boolean}) {
      if (id === resolvedVirtualModuleId) {
        if (!env || loadOptions?.ssr !== true) {
          return 'export default undefined;'
        }
        return `${runtimeEnvModuleCode(env)}\nexport default runtimeEnv;`
      }
      return null
    },
  } satisfies PartialDeep<PluginOption>
}
