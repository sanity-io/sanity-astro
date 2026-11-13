export type RuntimeEnvOption = {
  /** Name of the environment variable that holds the project ID, for example `SANITY_PROJECT_ID`. */
  projectId?: string
  /** Name of the environment variable that holds the dataset, for example `SANITY_DATASET`. */
  dataset?: string
}

type RuntimeEnvKey = keyof RuntimeEnvOption

const runtimeEnvKeys: RuntimeEnvKey[] = ['projectId', 'dataset']

// The names are written into generated `import { NAME } from "astro:env/server"` statements.
// Same rule as Astro uses for `env.schema` keys, which it does not check for integrations.
const variableNamePattern = /^[A-Z_][A-Z0-9_]*$/

type EnvField = {type?: unknown; context?: unknown; access?: unknown}

export function resolveRuntimeEnv(env: RuntimeEnvOption | undefined): RuntimeEnvOption | undefined {
  if (!env?.projectId && !env?.dataset) {
    return undefined
  }
  for (const key of runtimeEnvKeys) {
    const name = env[key]
    if (name !== undefined && !variableNamePattern.test(name)) {
      throw new Error(
        `[@sanity/astro]: \`env.${key}\` must be the name of an environment variable in uppercase letters, numbers and underscores, for example \`SANITY_${key === 'projectId' ? 'PROJECT_ID' : 'DATASET'}\``,
      )
    }
  }
  return env
}

/**
 * `astro:env` fields for the variables, as `context: 'server', access: 'secret'` since only those
 * are read when the server starts; every other kind is inlined at build time. Variables the
 * project already declares that way are left as they are.
 */
export function runtimeEnvSchema(
  env: RuntimeEnvOption,
  existingSchema: Record<string, EnvField> | undefined,
): Record<string, {type: 'string'; context: 'server'; access: 'secret'; optional: true}> {
  const schema: Record<
    string,
    {type: 'string'; context: 'server'; access: 'secret'; optional: true}
  > = {}
  for (const name of new Set(Object.values(env))) {
    const existing = existingSchema?.[name]
    if (existing) {
      if (
        existing.type !== 'string' ||
        existing.context !== 'server' ||
        existing.access !== 'secret'
      ) {
        throw new Error(
          `[@sanity/astro]: \`${name}\` is declared in \`env.schema\` but the \`env\` option needs it as \`envField.string({context: 'server', access: 'secret'})\`. Astro inlines every other kind of variable at build time. Change the declaration or remove it and let the integration add it`,
        )
      }
      continue
    }
    schema[name] = {type: 'string', context: 'server', access: 'secret', optional: true}
  }
  return schema
}

/**
 * Code for a server module that defines `runtimeEnv`, an object with the configured values that
 * are set when the server runs. Unset or empty variables are left out, so the build-time value
 * applies.
 */
export function runtimeEnvModuleCode(env: RuntimeEnvOption): string {
  const entries = runtimeEnvKeys.flatMap((key) => {
    const name = env[key]
    return name ? [[key, name] as const] : []
  })
  const imports = [...new Set(entries.map(([, name]) => name))].join(', ')
  const pairs = entries.map(([key, name]) => `[${JSON.stringify(key)}, ${name}]`).join(', ')
  return `
    import { ${imports} } from "astro:env/server";
    const runtimeEnv = Object.fromEntries(
      [${pairs}].filter(([, value]) => typeof value === "string" && value !== "")
    );
  `
}
