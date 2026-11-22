import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * This is the schema definition for the rich text fields used for
 * for this blog studio. When you import it in schemas.js it can be
 * reused in other parts of the studio with:
 *  {
 *    name: 'someName',
 *    title: 'Some title',
 *    type: 'blockContent'
 *  }
 */
export default defineType({
  title: 'Block Content',
  name: 'blockContent',
  type: 'array',
  of: [
    defineArrayMember({
      title: 'Block',
      type: 'block',
      // Styles let you set what your user can mark up blocks with. These
      // correspond with HTML tags, but you can set any title or value
      // you want and decide how you want to deal with it where you want to
      // use your content.
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'H1', value: 'h1'},
        {title: 'H2', value: 'h2'},
        {title: 'H3', value: 'h3'},
        {title: 'H4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [{title: 'Bullet', value: 'bullet'}],
      // Marks let you mark up inline text in the block editor.
      marks: {
        // Decorators usually describe a single property – e.g. a typographic
        // preference or highlighting by editors.
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
        ],
        // Annotations can be any object structure – e.g. a link or a footnote.
        annotations: [
          {
            title: 'URL',
            name: 'link',
            type: 'object',
            fields: [
              {
                title: 'URL',
                name: 'href',
                type: 'url',
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'image',
      options: {
        hotspot: true, // enables crop/hotspot in Studio
      },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
        }),
      ],
    }),
    defineArrayMember({
      name: 'youtube',
      type: 'object',
      title: 'YouTube Video',
      fields: [
        defineField({
          name: 'url',
          type: 'url',
          title: 'YouTube URL',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'title',
          type: 'string',
          title: 'Title',
        }),
      ],
    }),
    defineArrayMember({
      name: 'code',
      type: 'object',
      title: 'Code',
      fields: [
        defineField({
          name: 'code',
          type: 'text',
          title: 'Code',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'language',
          type: 'string',
          title: 'Language (all lowercase)',
          validation: (Rule) =>
            Rule.custom((value) => {
              if (!value) return true; // Allow empty if optional; add Rule.required() if mandatory

              if (value !== value.toLowerCase()) {
                return `Prism requires lowercase language names. Please use "${value.toLowerCase()}" instead of "${value}".`;
              }

              if (/\s/.test(value)) {
                return 'Prism language identifiers cannot contain spaces.';
              }

              return true;
            }),
        }),
      ],
    }),
    // defineArrayMember({
    //   type: 'code',
    // }),
  ],
})
