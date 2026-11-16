// src/sanity/lib/loadQuery.ts
import { sanityClient } from 'sanity:client';
import type { ClientPerspective, QueryParams } from '@sanity/client';
import type { PortableTextBlock, Slug } from "sanity";
import { getActivePerspective } from '@sanity/astro/middleware';
import groq from "groq";
import Author from "../../schemaTypes/objects/author.ts";

const visualEditingEnabled =
  import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true';
const token = import.meta.env.SANITY_API_READ_TOKEN;

// When Visual Editing is off, default to 'published' (safe for both SSG builds and
// public SSR servers), unless overridden for a companion SSR preview server via
// PUBLIC_SANITY_PREVIEW_SSR="true" or an explicit PUBLIC_SANITY_DEFAULT_PERSPECTIVE.
const defaultPerspective: ClientPerspective =
  (import.meta.env.PUBLIC_SANITY_DEFAULT_PERSPECTIVE as
    | ClientPerspective
    | undefined) ||
  (import.meta.env.PUBLIC_SANITY_PREVIEW_SSR === 'true'
    ? 'drafts'
    : 'published');

export interface LoadQueryOptions {
  query: string;
  params?: QueryParams;
  perspective?: ClientPerspective;
}

/**
 * Isolating queries in a server-only helper allows seamless switching between
 * static (SSG) and dynamic (SSR) rendering while keeping `SANITY_API_READ_TOKEN`
 * strictly out of `astro.config.mjs` and client-side bundles.
 */
export async function loadQuery<QueryResponse>({
                                                 query,
                                                 params = {},
                                                 perspective,
                                               }: LoadQueryOptions) {
  const activePerspective: ClientPerspective =
    perspective ??
    (visualEditingEnabled ? getActivePerspective() : defaultPerspective);

  // Sanity API invariant: perspectives other than 'published' require a token and useCdn: false
  const isPublished = activePerspective === 'published';

  if (!isPublished && !token) {
    throw new Error(
      `You must set SANITY_API_READ_TOKEN to query with perspective "${String(activePerspective)}".`,
    );
  }

  const resultSourceMap = visualEditingEnabled ? 'withKeyArraySelector' : false;

  const {result, resultSourceMap: sourceMap} = await sanityClient
    .withConfig({
      perspective: activePerspective,
      useCdn: isPublished ? Boolean(sanityClient.config().useCdn) : false,
      token: isPublished ? undefined : token,
      stega: {
        enabled: visualEditingEnabled,
        studioUrl:
          sanityClient.config().stega?.studioUrl ||
          import.meta.env.PUBLIC_SANITY_STUDIO_URL ||
          '/studio',
      },
    })
    .fetch<QueryResponse>(query, params, {
      filterResponse: false,
      resultSourceMap,
    });
  return result;
}

export const POSTS_QUERY = groq`
  *[_type == "post"] | order(publishedAt desc)
  `
export async function getPosts(): Promise<Post[]> {
  return loadQuery<Post[]>(
    {
      query: POSTS_QUERY,
    });
}

export const POST_QUERY = groq`
  *[_type == "post" && slug.current == $slug][0]{
    ...,
    authors[]->{ name }
  }
`;

export async function getPost(slug: string): Promise<Post> {

  return loadQuery<Post>({
    query:POST_QUERY,
    params:{ slug }
  });
}

export interface SanityImage {
  _type: "image";
  asset?: { _ref: string; _type: "reference" };
  hotspot?: { x: number; y: number; height: number; width: number };
  crop?: { top: number; bottom: number; left: number; right: number };
  alt?: string;
  caption?: string;
  /** Original image width in pixels, from asset metadata */
  width: number;
  /** Original image height in pixels, from asset metadata */
  height: number;
  /** Low-quality image placeholder (base64 data URL) */
  lqip?: string;
}

export interface Seo {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: SanityImage;
}

export interface Author { name: string }

export interface Post {
  _id: string;
  _type: "post";
  _createdAt: string;
  title?: string;
  slug: Slug;
  authors?: Author[];
  excerpt?: string;
  mainImage?: SanityImage;
  description: PortableTextBlock[];
  body: PortableTextBlock[];
  seo?: Seo;
}