import type {SanityClient} from '@sanity/client'
import {validatePreviewUrl} from '@sanity/preview-url-secret'
import type {APIRoute} from 'astro'

const COOKIE_NAME = '__sanity_draft_mode'

export interface DefineEnableDraftModeOptions {
  client: SanityClient
  secret: string
}

export type EnableDraftModeContext = Parameters<APIRoute>[0]

/**
 * Define a function to enable draft mode for Sanity preview URLs.
 * Similar to Next.js's `defineEnableDraftMode` but adapted for Astro endpoints.
 *
 * @example
 * ```ts
 * // src/pages/api/draft.ts
 * import { defineEnableDraftMode } from '@sanity/astro'
 * import { sanityClient } from 'sanity:client'
 *
 * const { enable } = defineEnableDraftMode({
 *   client: sanityClient,
 *   secret: import.meta.env.SANITY_PREVIEW_SECRET,
 * })
 *
 * export const GET = async ({ request, cookies, redirect }) => {
 *   return enable({ request, cookies, redirect })
 * }
 * ```
 */
export function defineEnableDraftMode({
  client,
  secret,
}: DefineEnableDraftModeOptions) {
  return {
    async enable(context: {
      request: Request
      cookies: any
      redirect: (path: string, status?: number) => Response
    }) {
      const {request, cookies, redirect} = context
      const url = new URL(request.url)

      // Validate the preview URL using @sanity/preview-url-secret
      // The secret is embedded in the URL query parameters
      const {isValid, redirectTo = '/'} = await validatePreviewUrl(
        client,
        url.toString(),
      )

      if (!isValid) {
        return new Response('Invalid preview URL', {status: 401})
      }

      // Enable draft mode by setting the cookie
      // This matches the behavior of sanityDraftMode.enable() from the virtual module
      // import.meta.env.PROD is available at runtime in Astro projects
      const isProduction = (import.meta as any).env?.PROD ?? false
      cookies.set(COOKIE_NAME, 'true', {
        path: '/',
        httpOnly: false,
        secure: isProduction,
        sameSite: 'lax',
      })

      // Redirect to the validated preview URL
      return redirect(redirectTo, 307)
    },
  }
}

