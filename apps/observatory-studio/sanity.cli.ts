import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    // `||` so an unset OR empty env var falls back to the defaults
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'gvy5piix',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  deployment: {autoUpdates: false},
})
