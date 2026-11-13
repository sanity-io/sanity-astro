export type RuntimeEnvOption = {
  /** Name of the environment variable that holds the project ID, for example `SANITY_PROJECT_ID`. */
  projectId?: string
  /** Name of the environment variable that holds the dataset, for example `SANITY_DATASET`. */
  dataset?: string
}

const runtimeEnvKeys = ['projectId', 'dataset'] as const

/**
 * Code for a server module that defines `runtimeEnv`, an object with the configured values that
 * are set when the server runs. Unset or empty variables are left out, so the build-time value
 * applies. `getSecret` reads variables at runtime without an `env.schema` declaration.
 */
export function runtimeEnvModuleCode(env: RuntimeEnvOption): string {
  const pairs = runtimeEnvKeys
    .filter((key) => env[key])
    .map((key) => `[${JSON.stringify(key)}, getSecret(${JSON.stringify(env[key])})]`)
    .join(', ')
  return `
    import { getSecret } from "astro:env/server";
    const runtimeEnv = Object.fromEntries(
      [${pairs}].filter(([, value]) => typeof value === "string" && value !== "")
    );
  `
}
