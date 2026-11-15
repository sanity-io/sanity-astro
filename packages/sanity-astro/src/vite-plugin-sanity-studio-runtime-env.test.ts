import {describe, expect, it} from 'vitest'

import {
  type RuntimeEnvOption,
  vitePluginSanityStudioRuntimeEnv,
} from './vite-plugin-sanity-studio-runtime-env'

function importRuntimeEnv(env: RuntimeEnvOption | undefined, ssr: boolean) {
  const plugin = vitePluginSanityStudioRuntimeEnv(env) as unknown as {
    resolveId: (id: string) => string
    load: (id: string, options: {ssr: boolean}) => string
  }
  const code = plugin.load(plugin.resolveId('sanity:studio-runtime-env'), {ssr})
  const executable = code
    .replace('import { getSecret } from "astro:env/server";', 'const getSecret = () => "runtime";')
    .replace('export default', 'return')
  return new Function(executable)()
}

describe('vitePluginSanityStudioRuntimeEnv', () => {
  it('exports the values the server reads', () => {
    expect(importRuntimeEnv({dataset: 'SANITY_DATASET'}, true)).toStrictEqual({dataset: 'runtime'})
  })

  it.each([
    ['in the browser', {dataset: 'SANITY_DATASET'}, false],
    ['without the option', undefined, true],
  ])('exports undefined %s', (_, env, ssr) => {
    expect(importRuntimeEnv(env, ssr)).toBeUndefined()
  })
})
