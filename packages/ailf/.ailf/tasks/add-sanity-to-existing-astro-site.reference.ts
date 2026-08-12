/**
 * Reference solution: connect an existing Astro site to Sanity.
 *
 * The site keeps its existing integrations (mdx, sitemap) and gains the
 * @sanity/astro integration. Pages read from the sanity:client virtual
 * module instead of instantiating their own client.
 *
 * Note: .astro file contents are shown in comments since this is a .ts file.
 */

// === Part 1: Updated Astro configuration (astro.config.mjs) ===

import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    mdx(),
    sitemap(),
    sanity({
      projectId: 'xxxxxxxx',
      dataset: 'production',
      apiVersion: '2026-03-01',
      useCdn: false,
    }),
  ],
})

// === Part 2: Type declarations (src/env.d.ts) ===
//
// /// <reference types="astro/client" />
// /// <reference types="@sanity/astro/module" />

// === Part 3: Homepage (src/pages/index.astro) ===
//
// ---
// import {sanityClient} from 'sanity:client'
//
// const articles = await sanityClient.fetch(
//   `*[_type == "article" && defined(slug)] | order(publishedAt desc)[0...10]{
//     _id,
//     title,
//     publishedAt,
//     "slug": slug.current
//   }`,
// )
// ---
//
// <ul>
//   {articles.map((article) => (
//     <li>
//       <a href={`/articles/${article.slug}`}>{article.title}</a>
//       <time datetime={article.publishedAt}>
//         {new Date(article.publishedAt).toLocaleDateString()}
//       </time>
//     </li>
//   ))}
// </ul>
