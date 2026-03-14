import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'
import {presentationTool} from 'sanity/presentation'
import {schemaTypes} from './schemas'

export const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID! || '3do82whm'
export const dataset = import.meta.env.PUBLIC_SANITY_DATASET! || 'next'

const branchUrl =
  (import.meta.env?.['VERCEL_BRANCH_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_BRANCH_URL : undefined)
const deployUrl =
  (import.meta.env?.['VERCEL_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_URL : undefined)
const productionUrl =
  (import.meta.env?.['VERCEL_PROJECT_PRODUCTION_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined)

const previewUrlInitial = branchUrl
  ? `https://${branchUrl}`
  : deployUrl
    ? `https://${deployUrl}`
    : productionUrl
      ? `https://${productionUrl}`
      : 'http://localhost:4321'

export default defineConfig({
  name: 'project-name',
  title: 'Project Name',
  projectId,
  dataset,
  plugins: [
    deskTool(),
    visionTool(),
    presentationTool({
      previewUrl: {
        initial: previewUrlInitial,
        preview: '/',
      },
    }),
  ],
  schema: {
    types: schemaTypes,
  },
})
