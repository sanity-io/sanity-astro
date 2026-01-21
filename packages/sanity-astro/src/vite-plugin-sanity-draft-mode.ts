import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:draft-mode'
const resolvedVirtualModuleId = '\0' + virtualModuleId

const COOKIE_NAME = '__sanity_draft_mode'

export function vitePluginSanityDraftMode() {
  return {
    name: 'sanity:draft-mode',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          const COOKIE_NAME = '${COOKIE_NAME}';
          
          export const sanityDraftMode = {
            enable(cookies) {
              if (!cookies) {
                throw new Error('sanityDraftMode.enable() requires cookies parameter. Pass Astro.cookies from your component.');
              }
              const isProduction = import.meta.env.PROD;
              cookies.set(COOKIE_NAME, 'true', {
                path: '/',
                httpOnly: false,
                secure: isProduction,
                sameSite: 'lax',
              });
            },
            disable(cookies) {
              if (!cookies) {
                throw new Error('sanityDraftMode.disable() requires cookies parameter. Pass Astro.cookies from your component.');
              }
              cookies.delete(COOKIE_NAME, {
                path: '/',
              });
            },
            isEnabled(cookies) {
              if (!cookies) {
                return false;
              }
              const cookie = cookies.get(COOKIE_NAME);
              return cookie?.value === 'true';
            },
          };
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}

