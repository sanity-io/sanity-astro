import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {presentationTool} from 'sanity/presentation'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'
import {resolve} from './src/presentation'
import {SINGLETON_TYPES, structure} from './src/structure'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'gvy5piix'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
const previewOrigin = process.env.SANITY_STUDIO_PREVIEW_ORIGIN || 'http://localhost:4325'

// Content variants are a gated beta. Keep the studio usable on projects
// without the feature; flip this on once the project has it.
const variantsEnabled = process.env.SANITY_STUDIO_VARIANTS_ENABLED === 'true'

export default defineConfig({
  name: 'default',
  title: 'Zenith Observatory',
  projectId,
  dataset,
  plugins: [
    structureTool({structure}),
    presentationTool({
      previewUrl: {
        origin: previewOrigin,
        previewMode: {
          enable: '/api/preview/enable',
          disable: '/api/preview/disable',
        },
      },
      resolve,
    }),
    visionTool({defaultApiVersion: 'X'}),
  ],
  schema: {
    types: schemaTypes,
    templates: (prev) => prev.filter((template) => !SINGLETON_TYPES.has(template.schemaType)),
  },
  beta: {
    variants: {enabled: variantsEnabled},
  },
})
