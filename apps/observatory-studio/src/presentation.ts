import {defineDocuments, defineLocations, type PresentationPluginOptions} from 'sanity/presentation'

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    {route: '/', filter: `_type == "homePage"`},
    {route: '/visit', filter: `_type == "visitPage"`},
  ]),
  locations: {
    homePage: defineLocations({
      locations: [{title: 'Home', href: '/'}],
    }),
    visitPage: defineLocations({
      locations: [{title: 'Visit', href: '/visit'}],
    }),
    siteSettings: defineLocations({
      message: 'Used on every page',
      locations: [
        {title: 'Home', href: '/'},
        {title: 'Visit', href: '/visit'},
      ],
    }),
  },
}
