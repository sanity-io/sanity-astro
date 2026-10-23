import {defineBlueprint, defineSyncTagInvalidateFunction} from '@sanity/blueprints'

// Values already in the environment (CI, the shell) win over the observatory's `.env`, which wins
// over the defaults in its `.env.example`.
for (const file of ['apps/observatory/.env', 'apps/observatory/.env.example']) {
  try {
    process.loadEnvFile(file)
  } catch {}
}

const {PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET, INVALIDATE_URL, SANITY_INVALIDATE_SECRET} =
  process.env

// Blueprint `env` is additive, so leaving a value out keeps whatever is already deployed.
const env: Record<string, string> = {}
if (INVALIDATE_URL) env.INVALIDATE_URL = INVALIDATE_URL
if (SANITY_INVALIDATE_SECRET) env.SANITY_INVALIDATE_SECRET = SANITY_INVALIDATE_SECRET

/**
 * Deployed with `pnpm dlx sanity@latest blueprints deploy` from the repository root, see
 * "Sanity Function" in `apps/observatory/README.md`. A dataset can only have one sync tag
 * invalidate function, so it's scoped to the one the observatory reads.
 */
export default defineBlueprint({
  resources: [
    defineSyncTagInvalidateFunction({
      name: 'invalidate-sync-tags',
      src: './apps/observatory-functions/invalidate-sync-tags',
      event: {
        resource: {type: 'dataset', id: `${PUBLIC_SANITY_PROJECT_ID}.${PUBLIC_SANITY_DATASET}`},
      },
      env: Object.keys(env).length > 0 ? env : undefined,
    }),
  ],
})
