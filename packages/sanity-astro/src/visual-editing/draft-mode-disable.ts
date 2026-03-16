import {type APIRoute} from 'astro'
import {sanityVisualEditing} from 'sanity:visual-editing'
import {resolvePreviewModeConfig} from './draft-mode'

export const prerender = false

export const GET: APIRoute = ({cookies, redirect, url}) => {
  const previewMode = resolvePreviewModeConfig(sanityVisualEditing.previewMode)
  if (!previewMode) {
    return new Response('Preview mode is disabled', {status: 404})
  }

  cookies.delete(previewMode.cookie, {path: '/'})

  return redirect(url.searchParams.get('redirect') || '/', 307)
}
