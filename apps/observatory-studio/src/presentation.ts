import {defineDocuments, defineLocations, type PresentationPluginOptions} from 'sanity/presentation'

// The site renders drafts only under `/preview/*`, which the CDN never
// caches; the unprefixed paths serve the cached published pages.
export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    {route: '/preview', filter: `_type == "homePage"`},
    {route: '/preview/visit', filter: `_type == "visitPage"`},
  ]),
  locations: {
    homePage: defineLocations({
      locations: [{title: 'Home', href: '/preview'}],
    }),
    visitPage: defineLocations({
      locations: [{title: 'Visit', href: '/preview/visit'}],
    }),
    siteSettings: defineLocations({
      message: 'Used on every page',
      locations: [
        {title: 'Home', href: '/preview'},
        {title: 'Visit', href: '/preview/visit'},
      ],
    }),
  },
}
