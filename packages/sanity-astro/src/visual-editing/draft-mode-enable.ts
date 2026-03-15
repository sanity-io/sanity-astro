import {type APIRoute} from 'astro'
import {validatePreviewUrl} from '@sanity/preview-url-secret'
import {sanityClient} from 'sanity:client'
import {sanityVisualEditing} from 'sanity:visual-editing'
import {getDraftModeCookieOptions, resolvePreviewModeConfig} from './draft-mode'

export const prerender = false

export const GET: APIRoute = async ({cookies, redirect, url}) => {
  const previewMode = resolvePreviewModeConfig(sanityVisualEditing.previewMode)
  if (!previewMode) {
    return new Response('Preview mode is disabled', {status: 404})
  }
  const envToken =
    (import.meta as {env?: {SANITY_API_READ_TOKEN?: string}}).env?.SANITY_API_READ_TOKEN ||
    process.env.SANITY_API_READ_TOKEN
  const token = sanityVisualEditing.token || envToken
  if (!token) {
    return new Response('Missing visual editing token', {status: 500})
  }

  const {isValid, redirectTo = '/'} = await validatePreviewUrl(
    sanityClient.withConfig({token}),
    url.toString(),
  )

  if (!isValid) {
    return new Response('Invalid secret', {status: 401})
  }

  cookies.set(
    previewMode.cookie,
    sanityVisualEditing.previewModeId || 'preview',
    getDraftModeCookieOptions(process.env.NODE_ENV === 'production'),
  )

  return redirect(redirectTo, 307)
}
