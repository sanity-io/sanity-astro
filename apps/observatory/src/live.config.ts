import {defineLiveCollection} from 'astro:content'

import {defineSanityDocument} from './sanity/loader'
import {HOME_PAGE_QUERY, SITE_SETTINGS_QUERY, VISIT_PAGE_QUERY} from './sanity/queries'

const siteSettings = defineLiveCollection({
  loader: defineSanityDocument('siteSettings', SITE_SETTINGS_QUERY),
})

const homePage = defineLiveCollection({
  loader: defineSanityDocument('homePage', HOME_PAGE_QUERY),
})

const visitPage = defineLiveCollection({
  loader: defineSanityDocument('visitPage', VISIT_PAGE_QUERY),
})

export const collections = {siteSettings, homePage, visitPage}
