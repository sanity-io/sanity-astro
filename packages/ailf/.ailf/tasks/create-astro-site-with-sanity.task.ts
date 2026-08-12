import {defineTask} from '@sanity/ailf'

export default defineTask({
  mode: 'literacy',
  id: 'create-astro-site-with-sanity',
  title: 'Create a new Astro site with Sanity',
  area: 'astro',
  context: {
    docs: [
      {
        path: 'astro/introduction',
      },
      {
        path: 'astro/configure-sanity-astro',
      },
    ],
  },
  docCoverage: true,
  referenceSolution: 'tasks/create-astro-site-with-sanity.reference.ts',
  prompt: {
    text: `Set up a brand-new Astro site that displays content from Sanity using the @sanity/astro integration.

The Sanity project has ID \`xxxxxxxx\` and uses the \`production\` dataset. It contains \`post\` documents with \`title\`, \`slug\`, and \`publishedAt\` fields.

The homepage should list the titles of all published posts, newest first. The project uses TypeScript, so editors of the codebase should get proper types when working with the Sanity client.

Provide all the files needed: the Astro configuration, type declarations, and the homepage.`,
  },
  assertions: [
    {
      type: 'llm-rubric',
      template: 'task-completion',
      criteria: [
        {
          id: 'integration-added-to-config',
          text: '`astro.config.mjs` calls the Sanity integration inside the `integrations` array passed to `defineConfig` from `astro/config`.',
        },
        {
          id: 'integration-configured-for-project',
          text: "The integration is configured with `projectId: 'xxxxxxxx'` and `dataset: 'production'`.",
        },
        {
          id: 'homepage-fetches-posts',
          text: 'The homepage fetches posts with a GROQ query that filters on `_type == "post"` and orders by `publishedAt` descending.',
        },
        {
          id: 'homepage-renders-titles',
          text: 'The homepage renders the fetched post titles in its markup.',
        },
      ],
    },
    {
      type: 'llm-rubric',
      template: 'code-correctness',
      criteria: [
        {
          id: 'imports-default-integration',
          text: '`sanity` is imported as the default export from `@sanity/astro` and invoked as an integration.',
        },
        {
          id: 'uses-virtual-module',
          text: 'Content is fetched via `sanityClient` imported from the `sanity:client` virtual module, not by instantiating a client with `createClient` from `@sanity/client`.',
        },
        {
          id: 'module-types-referenced',
          text: 'A type declaration file (for example `src/env.d.ts`) includes `/// <reference types="@sanity/astro/module" />` so the `sanity:client` import type-checks.',
        },
        {
          id: 'sensible-client-options',
          text: 'The integration sets an `apiVersion` and makes a deliberate `useCdn` choice appropriate for the rendering mode.',
        },
      ],
    },
  ],
})
