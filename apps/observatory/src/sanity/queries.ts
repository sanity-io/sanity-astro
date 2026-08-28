import {defineQuery} from 'groq'

const IMAGE_PROJECTION = /* groq */ `{
  alt,
  hotspot,
  crop,
  asset->{_id, url, mimeType, metadata{dimensions{width, height, aspectRatio}}}
}`

export const SITE_SETTINGS_QUERY =
  defineQuery(`*[_type == "siteSettings" && _id == "siteSettings"][0]{
  siteTitle,
  nav,
  footerTagline,
  footerLinks
}`)

export const HOME_PAGE_QUERY = defineQuery(`*[_type == "homePage" && _id == "homePage"][0]{
  hero{
    eyebrow,
    heading,
    tagline,
    primaryCta,
    secondaryCta,
    image ${IMAGE_PROJECTION}
  },
  partnersHeading,
  partners,
  highlightsHeading,
  highlights[]{icon, title, body},
  testimonial{
    quote,
    name,
    role,
    affiliation,
    avatar ${IMAGE_PROJECTION}
  },
  cta{heading, body, cta},
  seo{title, description, ogImage{hotspot, crop, asset->{_id, url}}}
}`)

export const VISIT_PAGE_QUERY = defineQuery(`*[_type == "visitPage" && _id == "visitPage"][0]{
  heading,
  tagline,
  tiers[]{name, price, period, description, features, cta, highlighted},
  seo{title, description, ogImage{hotspot, crop, asset->{_id, url}}}
}`)
