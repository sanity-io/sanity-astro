import {describe, expect, it} from 'vitest'

import {vitePluginSanityStudioRuntimeEnv} from './vite-plugin-sanity-studio-runtime-env'

function loadModule(env: Parameters<typeof vitePluginSanityStudioRuntimeEnv>[0], ssr: boolean) {
  const plugin = vitePluginSanityStudioRuntimeEnv(env)
  const resolveId = plugin.resolveId as (id: string) => string | null
  const load = plugin.load as (id: string, options: {ssr: boolean}) => string
  const resolvedId = resolveId('sanity:studio-runtime-env')
  if (!resolvedId) {
    throw new Error('Expected sanity:studio-runtime-env to resolve')
  }
  return load(resolvedId, {ssr})
}

function evaluate(code: string, astroEnv: Record<string, string>) {
  const executable = code
    .replace(
      'import { getSecret } from "astro:env/server";',
      'const getSecret = (name) => __astroEnv[name];',
    )
    .replace('export default', 'return')
  return new Function('__astroEnv', executable)(astroEnv)
}

describe('vitePluginSanityStudioRuntimeEnv', () => {
  it('exports the runtime values on the server', () => {
    const code = loadModule({dataset: 'SANITY_DATASET'}, true)

    expect(evaluate(code, {SANITY_DATASET: 'runtime'})).toEqual({dataset: 'runtime'})
  })

  it('exports nothing in the browser or without the option', () => {
    expect(loadModule({dataset: 'SANITY_DATASET'}, false)).toBe('export default undefined;')
    expect(loadModule(undefined, true)).toBe('export default undefined;')
  })
})
