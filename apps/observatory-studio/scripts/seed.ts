/**
 * Seeds the dataset with the observatory site content: base documents, variant
 * definitions, and published home page variants for each audience.
 *
 * Idempotent: base documents are replaced, variant definitions are upserted,
 * and variant documents are recreated from the current base before publish.
 * On projects without the content variants beta, the variant steps are
 * skipped with a pointer to what to enable; the base site seeds fully.
 *
 * Requires SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET and a
 * SANITY_AUTH_TOKEN with write access (see .env.example).
 */

import {createClient} from '@sanity/client'
import sharp from 'sharp'

import {
  avatarSvg,
  deepSkySvg,
  duskMoonSvg,
  nightSkySvg,
  ogSvg,
  THEME_DEEP,
  THEME_DUSK,
  THEME_NIGHT,
} from './seedAssets.ts'
import {
  homePageDoc,
  homePageVariantContent,
  type SeedAssetIds,
  siteSettingsDoc,
  VARIANT_DEFINITIONS,
  visitPageDoc,
} from './seedContent.ts'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'gvy5piix'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
const token = requireEnv('SANITY_AUTH_TOKEN')

// Variant definition and document actions require the variants API version.
const client = createClient({projectId, dataset, apiVersion: 'X', token, useCdn: false})

interface VariantAction {
  actionType: string
  [key: string]: unknown
}

function runActions(actions: VariantAction[]): Promise<unknown> {
  return client.request<unknown>({
    url: `/data/actions/${dataset}`,
    method: 'POST',
    body: {actions},
  })
}

async function runActionsIgnoringFailure(actions: VariantAction[]): Promise<void> {
  try {
    await runActions(actions)
  } catch {
    // Expected when the target does not exist yet (first run).
  }
}

/** Projects without the content variants beta report a definition limit of 0. */
function isVariantsUnavailable(error: unknown): boolean {
  const description =
    error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error)
  return (
    description.includes('variantDefinitionLimitExceededError') ||
    description.includes('Variants are not available')
  )
}

async function uploadImage(filename: string, svg: string): Promise<string> {
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const asset = await client.assets.upload('image', png, {filename})
  console.log(`  asset ${filename} -> ${asset._id}`)
  return asset._id
}

async function uploadAssets(): Promise<SeedAssetIds> {
  console.log('Uploading image assets…')
  return {
    heroNight: await uploadImage('hero-night-dome.png', nightSkySvg(THEME_NIGHT)),
    heroDusk: await uploadImage('hero-dusk-moon.png', duskMoonSvg(THEME_DUSK)),
    heroDeep: await uploadImage('hero-deep-sky.png', deepSkySvg(THEME_DEEP)),
    avatarIngrid: await uploadImage('avatar-ingrid.png', avatarSvg('#fbbf24', '#6366f1')),
    avatarAmara: await uploadImage('avatar-amara.png', avatarSvg('#fb7185', '#3b82f6')),
    avatarTomas: await uploadImage('avatar-tomas.png', avatarSvg('#2dd4bf', '#8b5cf6')),
    og: await uploadImage('og-card.png', ogSvg(THEME_NIGHT)),
  }
}

async function seedBaseDocuments(assets: SeedAssetIds): Promise<void> {
  console.log('Publishing base documents…')
  await client
    .transaction()
    .createOrReplace(siteSettingsDoc())
    .createOrReplace(homePageDoc(assets))
    .createOrReplace(visitPageDoc(assets))
    .commit()
}

/** Returns false when the project has no access to the variants beta. */
async function seedVariantDefinitions(): Promise<boolean> {
  console.log('Upserting variant definitions…')
  for (const definition of VARIANT_DEFINITIONS) {
    const existing = await client.fetch<string | null>(
      '*[_id == $id][0]._id',
      {id: `_.variants.${definition.variantId}`},
      {perspective: 'raw'},
    )
    const metadata = {title: definition.title, description: definition.description}
    try {
      if (existing === null) {
        await runActions([
          {
            actionType: 'sanity.action.variant.definition.create',
            variantId: definition.variantId,
            conditions: definition.conditions,
            priority: 0,
            metadata,
          },
        ])
        console.log(`  created ${definition.variantId}`)
      } else {
        await runActions([
          {
            actionType: 'sanity.action.variant.definition.edit',
            variantId: definition.variantId,
            patch: {set: {conditions: definition.conditions, priority: 0, metadata}},
          },
        ])
        console.log(`  updated ${definition.variantId}`)
      }
    } catch (error) {
      if (isVariantsUnavailable(error)) {
        console.warn(
          `  the content variants beta is not enabled for project ${projectId}.\n` +
            '  Base content is seeded and the site works without personalization.\n' +
            '  Once the beta is enabled for the project, re-run `pnpm seed` and set\n' +
            '  PUBLIC_SANITY_VARIANTS_ENABLED=true (site) and\n' +
            '  SANITY_STUDIO_VARIANTS_ENABLED=true (studio).',
        )
        return false
      }
      throw error
    }
  }
  return true
}

async function seedHomePageVariants(assets: SeedAssetIds): Promise<void> {
  console.log('Publishing home page variants…')
  const variantContent = homePageVariantContent(assets)

  for (const definition of VARIANT_DEFINITIONS) {
    const {variantId} = definition

    // Recreate from the current base so re-runs always converge.
    await runActionsIgnoringFailure([
      {actionType: 'sanity.action.document.variant.delete', publishedId: 'homePage', variantId},
    ])
    await runActionsIgnoringFailure([
      {
        actionType: 'sanity.action.document.variant.delete',
        publishedId: 'homePage',
        variantId,
        bundleId: 'drafts',
      },
    ])

    const base = await client.getDocument('homePage')
    if (base === undefined) {
      throw new Error('homePage base document is missing')
    }

    await runActions([
      {
        actionType: 'sanity.action.document.variant.create',
        publishedId: 'homePage',
        variantId,
        baseId: 'homePage',
        ifBaseRevisionId: base._rev,
        bundleId: 'drafts',
      },
    ])

    const versionId = await client.fetch<string | null>(
      `*[_id in path("versions.**")
        && _system.group._ref == "homePage"
        && _system.variant._ref == $variantRef
        && _system.bundleId == "drafts"][0]._id`,
      {variantRef: `_.variants.${variantId}`},
      {perspective: 'raw'},
    )
    if (versionId === null) {
      throw new Error(`Could not find the created variant document for ${variantId}`)
    }

    await client.patch(versionId).set(variantContent[variantId]).commit()

    await runActions([
      {
        actionType: 'sanity.action.document.variant.publish',
        publishedId: 'homePage',
        variantId,
        bundleId: 'drafts',
      },
    ])
    console.log(`  published ${variantId}`)
  }
}

async function verify(withVariants: boolean): Promise<void> {
  console.log('Verifying reads…')
  const base = await client.fetch<string | null>('*[_id == "homePage"][0].hero.heading')
  console.log(`  base:       ${base}`)
  if (!withVariants) return
  for (const definition of VARIANT_DEFINITIONS) {
    const heading = await client.fetch<string | null>(
      '*[_id == "homePage"][0].hero.heading',
      {},
      {variant: definition.conditions},
    )
    console.log(`  ${definition.variantId}: ${heading}`)
  }
}

const assets = await uploadAssets()
await seedBaseDocuments(assets)
const variantsAvailable = await seedVariantDefinitions()
if (variantsAvailable) {
  await seedHomePageVariants(assets)
}
await verify(variantsAvailable)
console.log('Done.')
