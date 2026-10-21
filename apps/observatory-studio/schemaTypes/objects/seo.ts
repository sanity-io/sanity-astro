import {defineField, defineType} from 'sanity'

export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Shown in the browser tab and search results (max 60 characters)',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Meta description for search results (max 160 characters)',
      validation: (rule) => rule.required().max(160),
    }),
    defineField({
      name: 'ogImage',
      title: 'Social sharing image',
      type: 'image',
      options: {hotspot: true},
      description: 'Displayed when the page is shared (cropped to 1200×630 around the hotspot)',
    }),
  ],
})
