import {MarkerIcon} from '@sanity/icons/Marker'
import {defineField, defineType} from 'sanity'

export const visitPage = defineType({
  name: 'visitPage',
  title: 'Visit page',
  type: 'document',
  icon: MarkerIcon,
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().max(200),
    }),
    defineField({
      name: 'tiers',
      title: 'Tickets & memberships',
      type: 'array',
      of: [{type: 'tier'}],
      validation: (rule) => rule.required().min(2).max(4),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    prepare: () => ({title: 'Visit page'}),
  },
})
