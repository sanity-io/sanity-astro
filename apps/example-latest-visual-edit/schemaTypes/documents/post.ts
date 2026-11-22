import {defineField, defineType} from 'sanity'
/**
 * Post schema.  Define and edit the fields for the 'post' content type.
 * Learn more: https://www.sanity.io/docs/schema-types
 */

export default defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      validation: (Rule) => Rule.required(),
      options: {
        source: 'title',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'authors',
      title: 'Authors',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'author' }],
        },
      ],
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      options: {
        hotspot: true,
      },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'caption',
          type: 'text', // or 'text' if you want multi-line captions
          title: 'Caption',
        }),
      ],
    }),

    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      author0: 'authors.0.name',
      author1: 'authors.1.name',
      author2: 'authors.2.name',
      author3: 'authors.3.name',
      media: 'mainImage',
    },
    prepare({title, author0, author1, author2, author3, media}) {
      const authors = [author0, author1, author2].filter(Boolean)
      const subtitle =
        authors.length > 0
          ? `by ${authors.join(', ')}${author3 ? '…' : ''}`
          : undefined
      return {title, subtitle, media}
    },
  },
})