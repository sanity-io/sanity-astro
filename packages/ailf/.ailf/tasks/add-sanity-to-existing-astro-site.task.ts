import {defineTask} from '@sanity/ailf'

export default defineTask({
  mode: 'literacy',
  id: 'add-sanity-to-existing-astro-site',
  title: 'Add Sanity to an existing Astro site',
  area: 'astro',
  context: {
    docs: [
      {
        path: 'astro/configure-sanity-astro',
      },
      {
        path: 'astro/query-content-astro',
      },
    ],
  },
  docCoverage: true,
  referenceSolution: 'tasks/add-sanity-to-existing-astro-site.reference.ts',
  prompt: {
    text: `Our marketing site is built with Astro. The content team has started managing articles in our Sanity project (project ID \`xxxxxxxx\`, dataset \`production\`), where each \`article\` document has \`title\`, \`slug\`, and \`publishedAt\` fields.

Connect the site to Sanity so the homepage lists the ten most recent articles with their title and publish date, each linking to \`/articles/<slug>\`. The rest of the site must keep working as-is.

This is the existing Astro configuration:

\`\`\`js
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import {defineConfig} from 'astro/config'

export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap()],
})
\`\`\`

Show every change needed - configuration and page code.`,
  },
  assertions: [
    {
      type: 'llm-rubric',
      template: 'task-completion',
      criteria: [
        {
          id: 'preserves-existing-integrations',
          text: 'The updated configuration keeps the existing `mdx()` and `sitemap()` integrations and the `site` option.',
        },
        {
          id: 'connects-to-project',
          text: "The Sanity connection is configured with `projectId: 'xxxxxxxx'` and `dataset: 'production'`.",
        },
        {
          id: 'queries-ten-most-recent',
          text: 'The homepage query orders articles by `publishedAt` descending and limits the result to ten items.',
        },
        {
          id: 'renders-title-date-and-link',
          text: 'Each rendered article shows its title and publish date and links to `/articles/<slug>` using the slug value.',
        },
      ],
    },
    {
      type: 'llm-rubric',
      template: 'code-correctness',
      criteria: [
        {
          id: 'uses-official-integration',
          text: 'The Sanity connection is made by adding the `@sanity/astro` integration to the `integrations` array, not by hand-rolling a client with `createClient` from `@sanity/client` in page files.',
        },
        {
          id: 'fetches-via-virtual-module',
          text: 'Page code fetches content with `sanityClient` imported from the `sanity:client` virtual module.',
        },
        {
          id: 'valid-groq-slice',
          text: 'The GROQ query uses a valid ordering and slice, such as `| order(publishedAt desc)[0...10]`.',
        },
        {
          id: 'config-remains-valid',
          text: 'The final `astro.config.mjs` is a valid ESM Astro configuration exported via `defineConfig`.',
        },
      ],
    },
  ],
})
