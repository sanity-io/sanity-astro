import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemas'

export const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID! || '3do82whm'
export const dataset = import.meta.env.PUBLIC_SANITY_DATASET! || 'next'

export default defineConfig({
  name: 'project-name',
  title: 'Project Name',
  projectId,
  dataset,
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
})
