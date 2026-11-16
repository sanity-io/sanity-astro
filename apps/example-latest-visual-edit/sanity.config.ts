import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {sanityClient} from 'sanity:client'

import {schemaTypes} from './schemaTypes'

const {projectId, dataset} = sanityClient.config()
if (!projectId || !dataset) {
  throw new Error('Missing projectId or dataset')
}
console.log('projectId', projectId)
export default defineConfig([
  {
    name: 'admin',
    title: 'Sanity-Astro Upgrade',
    basePath: '/admin',
    projectId,
    dataset,
    plugins: [structureTool(), visionTool()],
    schema: {
      types: schemaTypes,
    },
  }
  // },
  // {
  //   name: 'project-name-2',
  //   title: 'Project Name Again',
  //   basePath: '/workspace-2',
  //   projectId,
  //   dataset,
  //   plugins: [structureTool(), visionTool()],
  //   schema: {
  //     types: schemaTypes,
  //   },
  // },
])
