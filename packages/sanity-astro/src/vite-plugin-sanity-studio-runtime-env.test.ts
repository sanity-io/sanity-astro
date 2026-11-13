import {describe, expect, it} from 'vitest'

import {
  runtimeEnvCode,
  vitePluginSanityStudioRuntimeEnv,
} from './vite-plugin-sanity-studio-runtime-env'

function evaluate(code: string, astroEnv: Record<string, string> = {}) {
  const executable = code
    .replace(
      'import { getSecret } from "astro:env/server";',
      'const getSecret = (name) => __astroEnv[name];',
    )
    .replace('export default runtimeEnv;', '')
  return new Function('__astroEnv', `${executable}\nreturn runtimeEnv;`)(astroEnv)
}

describe('runtimeEnvCode', () => {
  it('reads the variables on the server and leaves out unset or empty ones', () => {
    const code = runtimeEnvCode({projectId: 'SANITY_PROJECT_ID', dataset: 'SANITY_DATASET'}, true)

    expect(evaluate(code, {SANITY_DATASET: 'runtime', SANITY_PROJECT_ID: ''})).toEqual({
      dataset: 'runtime',
    })
  })

  it('declares undefined in the browser or without the option', () => {
    expect(evaluate(runtimeEnvCode({dataset: 'SANITY_DATASET'}, false))).toBeUndefined()
    expect(evaluate(runtimeEnvCode(undefined, true))).toBeUndefined()
  })
})

describe('vitePluginSanityStudioRuntimeEnv', () => {
  it('exports runtimeEnv from sanity:studio-runtime-env', () => {
    const plugin = vitePluginSanityStudioRuntimeEnv({dataset: 'SANITY_DATASET'})
    const resolveId = plugin.resolveId as (id: string) => string | null
    const load = plugin.load as (id: string, options: {ssr: boolean}) => string
    const code = load(resolveId('sanity:studio-runtime-env') ?? '', {ssr: true})

    expect(code).toContain('export default runtimeEnv;')
    expect(evaluate(code, {SANITY_DATASET: 'runtime'})).toEqual({dataset: 'runtime'})
  })
})
