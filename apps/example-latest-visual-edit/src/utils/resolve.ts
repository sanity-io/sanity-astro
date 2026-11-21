import {
  defineDocuments,
  defineLocations,
  type DocumentLocation,
} from "sanity/presentation";

const homeLocation = {
  title: "Home",
  href: "/",
} satisfies DocumentLocation;

export const resolve = {
  mainDocuments: defineDocuments([
    {
      route: "/posts/:slug",
      filter: `_type == "post" && (slug.current == $slug || _id == $slug)`,
    },
  ]),
  locations: {
    settings: defineLocations({
      locations: [homeLocation],
      message: "This document is used on all pages",
      tone: "caution",
    }),
    post: defineLocations({
      select: {
        title: "title",
        slug: "slug.current",
      },
      resolve: (doc) => ({
        locations: [
          doc
            ? {
              title: doc?.title || "Untitled",
              href: `/post/${doc.slug}`,
            }
            : null,
          homeLocation,
        ].filter(Boolean) as DocumentLocation[],
      }),
    }),
  },
}