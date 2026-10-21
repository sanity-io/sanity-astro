import {defineField, defineType} from 'sanity'

export const link = defineType({
  name: 'link',
  title: 'Link',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'href',
      title: 'URL',
      type: 'string',
      description: 'Relative path (e.g. /visit) or absolute https:// URL',
      validation: (rule) =>
        rule.required().custom((value) => {
          if (typeof value !== 'string') return true
          if (value.startsWith('/') || value.startsWith('https://')) return true
          return 'Must start with / or https://'
        }),
    }),
  ],
})
