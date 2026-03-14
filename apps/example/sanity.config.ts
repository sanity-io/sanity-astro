import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'
import {presentationTool} from 'sanity/presentation'
import {sanityClient} from 'sanity:client'
import {schemaTypes} from './schemas'

const {projectId, dataset} = sanityClient.config()
if (!projectId || !dataset) {
  throw new Error('Missing projectId or dataset')
}

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

console.log('projectId', projectId)
export default defineConfig([
  {
    name: 'project-name',
    title: 'Project Name',
    basePath: '/workspace-1',
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
  },
  {
    name: 'project-name-2',
    title: 'Project Name Again',
    basePath: '/workspace-2',
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
  },
])
