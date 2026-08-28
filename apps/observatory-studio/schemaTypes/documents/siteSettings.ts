import {CogIcon} from '@sanity/icons/Cog'
import {defineField, defineType} from 'sanity'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({
      name: 'siteTitle',
      title: 'Site title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'nav',
      title: 'Navigation',
      type: 'array',
      of: [{type: 'link'}],
      validation: (rule) => rule.required().min(1).max(5),
    }),
    defineField({
      name: 'footerTagline',
      title: 'Footer tagline',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'footerLinks',
      title: 'Footer links',
      type: 'array',
      of: [{type: 'link'}],
      validation: (rule) => rule.required().min(1).max(8),
    }),
  ],
  preview: {
    prepare: () => ({title: 'Site settings'}),
  },
})
