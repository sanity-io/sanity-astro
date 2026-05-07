import {z, type ZodObject, type ZodRawShape} from 'astro/zod'

export const sanitySystemFieldsSchema = z.object({
  _id: z.string(),
  _type: z.string(),
  _createdAt: z.string().optional(),
  _updatedAt: z.string().optional(),
  _rev: z.string().optional(),
})

export function defineSanityDocumentSchema<T extends ZodRawShape>(shape: T): ZodObject<T & typeof sanitySystemFieldsSchema.shape> {
  return sanitySystemFieldsSchema.extend(shape)
}

export function createSanitySchemaMap<T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T): T {
  return schemas
}

export {z}
