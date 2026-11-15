import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

export type RuntimeEnvOption = {
  /** Name of the environment variable that holds the project ID, for example `SANITY_PROJECT_ID`. */
  projectId?: string
  /** Name of the environment variable that holds the dataset, for example `SANITY_DATASET`. */
  dataset?: string
}

const runtimeEnvKeys = ['projectId', 'dataset'] as const

/**
 * Code that declares `runtimeEnv`: on the server, the configured variables that are set when it
 * runs; otherwise `undefined`. Unset or empty variables are left out, so build-time values apply.
 */
export function runtimeEnvCode(env: RuntimeEnvOption | undefined, isServerBuild: boolean): string {
  if (!env || !isServerBuild) {
    return 'const runtimeEnv = undefined;'
  }
  const names = Object.fromEntries(
    runtimeEnvKeys.filter((key) => env[key]).map((key) => [key, env[key]]),
  )
  return `
    import { getSecret } from "astro:env/server";
    const runtimeEnv = Object.fromEntries(
      Object.entries(${JSON.stringify(names)})
        .map(([key, name]) => [key, getSecret(name)])
        .filter(([, value]) => value)
    );
  `
}

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
        return `${runtimeEnvCode(env, loadOptions?.ssr === true)}\nexport default runtimeEnv;`
      }
      return null
    },
  } satisfies PartialDeep<PluginOption>
}
