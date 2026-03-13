import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'
import {sanityClient} from 'sanity:client'
import {schemaTypes} from './schemas'

const {projectId, dataset} = sanityClient.config()
if (!projectId || !dataset) {
  throw new Error('Missing projectId or dataset')
}
console.log('projectId', projectId)
export default defineConfig([
  {
    name: 'project-name',
    title: 'Project Name',
    basePath: '/workspace-1',
    projectId,
    dataset,
    plugins: [deskTool(), visionTool()],
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
    plugins: [deskTool(), visionTool()],
    schema: {
      types: schemaTypes,
    },
  },
])
