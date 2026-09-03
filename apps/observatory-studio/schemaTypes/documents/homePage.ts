import {HomeIcon} from '@sanity/icons/Home'
import {defineField, defineType} from 'sanity'

export const homePage = defineType({
  name: 'homePage',
  title: 'Home page',
  type: 'document',
  icon: HomeIcon,
  fields: [
    defineField({
      name: 'hero',
      title: 'Hero',
      type: 'hero',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'partnersHeading',
      title: 'Partners heading',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'partners',
      title: 'Partners',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Partner institutions rendered as a wordmark strip',
      validation: (rule) => rule.required().min(4).max(6),
    }),
    defineField({
      name: 'highlightsHeading',
      title: 'Highlights heading',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'highlights',
      title: 'Highlights',
      type: 'array',
      of: [{type: 'highlight'}],
      validation: (rule) => rule.required().min(3).max(6),
    }),
    defineField({
      name: 'testimonial',
      title: 'Visitor voice',
      type: 'testimonial',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cta',
      title: 'Closing call to action',
      type: 'callToAction',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    prepare: () => ({title: 'Home page'}),
  },
})
