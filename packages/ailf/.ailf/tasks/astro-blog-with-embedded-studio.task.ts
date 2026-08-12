import {defineTask} from '@sanity/ailf'

export default defineTask({
  mode: 'literacy',
  id: 'astro-blog-with-embedded-studio',
  title: 'Astro blog with an embedded Sanity Studio',
  area: 'astro',
  context: {
    docs: [
      {
        path: 'astro/embedding-studio-in-astro',
      },
      {
        path: 'astro/query-content-astro',
      },
      {
        path: 'astro/images-and-portable-text-astro',
      },
    ],
  },
  docCoverage: true,
  referenceSolution: 'tasks/astro-blog-with-embedded-studio.reference.ts',
  prompt: {
    text: `Build a blog with Astro where editors manage content in a Sanity Studio that is embedded in the same Astro site at \`/admin\`.

Blog posts have a title, a URL slug generated from the title, a publish date, a main image with alternative text, and a rich text body.

The site needs a homepage that lists all posts newest first, and a page for each post at \`/posts/<slug>\` that renders the title, the image, and the rich text body.

The Sanity project has ID \`xxxxxxxx\` and uses the \`production\` dataset.

Provide the Astro configuration, the Studio configuration with the schema, and the page components.`,
  },
  assertions: [
    {
      type: 'llm-rubric',
      template: 'task-completion',
      criteria: [
        {
          id: 'studio-mounted-at-admin',
          text: 'A Sanity Studio is served by the Astro site itself at the `/admin` route.',
        },
        {
          id: 'post-schema-complete',
          text: 'The `post` schema has a string `title`, a `slug` with `options.source` set to the title, a `datetime` publish date, an `image` field with an alt text field, and a portable text `body` (an `array` of `block`).',
        },
        {
          id: 'homepage-lists-newest-first',
          text: 'The homepage fetches posts ordered by publish date descending and renders a link to each post page.',
        },
        {
          id: 'post-page-by-slug',
          text: 'A dynamic route at `/posts/[slug]` resolves the post for the requested slug (via `getStaticPaths` or a parameterized fetch) and renders its title.',
        },
        {
          id: 'renders-rich-text-and-image',
          text: 'The post page renders the portable text body as components and the main image via a Sanity image CDN URL.',
        },
      ],
    },
    {
      type: 'llm-rubric',
      template: 'code-correctness',
      criteria: [
        {
          id: 'uses-studio-base-path',
          text: "The Studio is embedded by setting `studioBasePath: '/admin'` on the `@sanity/astro` integration, with a separate `sanity.config.ts` created with `defineConfig` from `sanity`.",
        },
        {
          id: 'react-integration-present',
          text: 'The `@astrojs/react` integration is added to the Astro config, as the embedded Studio requires it.',
        },
        {
          id: 'schema-uses-helpers',
          text: 'The schema is defined with `defineType` and `defineField` from `sanity`.',
        },
        {
          id: 'portable-text-component',
          text: 'The rich text body is rendered with a portable text component (for example `astro-portabletext`), not by manually walking block nodes.',
        },
        {
          id: 'image-url-builder',
          text: 'Image URLs are built with `@sanity/image-url` from the configured client, not constructed by hand from asset references.',
        },
        {
          id: 'parameterized-slug-query',
          text: 'Fetching a single post by slug uses a parameterized GROQ query (for example `slug.current == $slug`) rather than string interpolation.',
        },
      ],
    },
  ],
})
