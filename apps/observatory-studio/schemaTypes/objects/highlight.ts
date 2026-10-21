import {defineField, defineType} from 'sanity'

export const HIGHLIGHT_ICONS = [
  {title: 'Dome', value: 'dome'},
  {title: 'Telescope', value: 'telescope'},
  {title: 'Orbit', value: 'orbit'},
  {title: 'Comet', value: 'comet'},
  {title: 'Moon', value: 'moon'},
  {title: 'School', value: 'school'},
] as const

export const highlight = defineType({
  name: 'highlight',
  title: 'Highlight',
  type: 'object',
  fields: [
    defineField({
      name: 'icon',
      title: 'Icon',
      type: 'string',
      options: {list: [...HIGHLIGHT_ICONS]},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required().max(240),
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'body'},
  },
})
