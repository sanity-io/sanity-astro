import {isDraftMode, resolvePreviewModeConfig} from '@sanity/astro/visual-editing'
import {type QueryParams} from 'sanity'
import {sanityClient} from 'sanity:client'
import {sanityVisualEditing} from 'sanity:visual-editing'

type CookieStoreLike = {
  get: (name: string) => {value?: string} | string | undefined
}

export async function loadQuery<QueryResponse>({
  query,
  params,
  cookies,
}: {
  query: string
  params?: QueryParams
  cookies?: CookieStoreLike
}) {
  const previewMode = resolvePreviewModeConfig(sanityVisualEditing.previewMode)
  const draftModeOptions = previewMode
    ? {
        cookieName: previewMode.cookie,
        ...(sanityVisualEditing.previewModeId
          ? {cookieValue: sanityVisualEditing.previewModeId}
          : {}),
      }
    : undefined
  const visualEditingEnabled = previewMode
    ? isDraftMode(cookies, draftModeOptions)
    : false
  const token = sanityVisualEditing.token || import.meta.env.SANITY_API_READ_TOKEN

  if (visualEditingEnabled && !token) {
    throw new Error('The `SANITY_API_READ_TOKEN` environment variable is required in Draft Mode.')
  }

  const perspective = visualEditingEnabled ? 'drafts' : 'published'

  const {result, resultSourceMap} = await sanityClient.fetch<QueryResponse>(query, params ?? {}, {
    filterResponse: false,
    perspective,
    resultSourceMap: visualEditingEnabled ? 'withKeyArraySelector' : false,
    stega: visualEditingEnabled,
    ...(visualEditingEnabled ? {token} : {}),
    useCdn: !visualEditingEnabled,
  })

  return {
    data: result,
    sourceMap: resultSourceMap,
    perspective,
  }
}
