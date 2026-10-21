import {defineField, defineType} from 'sanity'

export const tier = defineType({
  name: 'tier',
  title: 'Ticket or membership',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'string',
      description: 'Display value, e.g. "$14" or "Free"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'period',
      title: 'Period',
      type: 'string',
      description: 'e.g. "per person" or "per month". Leave empty for one-off prices.',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().max(160),
    }),
    defineField({
      name: 'features',
      title: 'What it includes',
      type: 'array',
      of: [{type: 'string'}],
      validation: (rule) => rule.required().min(3),
    }),
    defineField({
      name: 'cta',
      title: 'Call to action',
      type: 'link',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'highlighted',
      title: 'Highlighted',
      type: 'boolean',
      description: 'Visually emphasize this tier',
      initialValue: false,
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'price'},
  },
})
