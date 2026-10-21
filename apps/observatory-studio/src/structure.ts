import type {StructureResolver} from 'sanity/structure'

export const SINGLETON_TYPES = new Set(['homePage', 'visitPage', 'siteSettings'])

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Home page')
        .id('homePage')
        .schemaType('homePage')
        .child(S.document().schemaType('homePage').documentId('homePage')),
      S.listItem()
        .title('Visit page')
        .id('visitPage')
        .schemaType('visitPage')
        .child(S.document().schemaType('visitPage').documentId('visitPage')),
      S.divider(),
      S.listItem()
        .title('Site settings')
        .id('siteSettings')
        .schemaType('siteSettings')
        .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
    ])
