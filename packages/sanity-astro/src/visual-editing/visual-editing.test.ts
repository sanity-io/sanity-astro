import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {transformWithOxc} from 'vite'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'

const astroFilePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  './visual-editing.astro',
)
const astroSource = readFileSync(astroFilePath, 'utf8')

function extractScripts(source: string): {inlineScript: string; moduleScript: string} {
  const inlineMatch = source.match(/<script define:vars=\{\{[^}]+}}>([\s\S]*?)<\/script>/)
  const moduleMatch = source.match(/<script>([\s\S]*?)<\/script>/)

  if (!inlineMatch?.[1] || !moduleMatch?.[1]) {
    throw new Error('Expected both inline and module <script> blocks in visual-editing.astro')
  }

  return {
    inlineScript: inlineMatch[1],
    moduleScript: moduleMatch[1],
  }
}

const {inlineScript, moduleScript} = extractScripts(astroSource)

type Listener = (event?: any) => void

function createBrowserEnv({
                            href = 'http://localhost:4321/movies/alien',
                            inIframe = true,
                            readyState = 'complete',
                            initialCookie = '',
                          }: {
  href?: string
  inIframe?: boolean
  readyState?: 'loading' | 'complete'
  initialCookie?: string
} = {}) {
  let currentUrl = new URL(href)
  let cookieJar = initialCookie
  const storage = new Map<string, string>()
  const windowListeners = new Map<string, Set<Listener>>()
  const documentListeners = new Map<string, Set<Listener>>()

  const reload = vi.fn()
  const assign = vi.fn((next: string) => {
    currentUrl = new URL(next, currentUrl.origin)
  })
  const replace = vi.fn((next: string) => {
    currentUrl = new URL(next, currentUrl.origin)
  })
  const back = vi.fn()
  const pushState = vi.fn((_state: unknown, _unused: string, nextUrl?: string | URL | null) => {
    if (nextUrl) {
      currentUrl = new URL(String(nextUrl), currentUrl.origin)
    }
  })
  const replaceState = vi.fn((_state: unknown, _unused: string, nextUrl?: string | URL | null) => {
    if (nextUrl) {
      currentUrl = new URL(String(nextUrl), currentUrl.origin)
    }
  })

  const location = {
    get href() {
      return currentUrl.href
    },
    get origin() {
      return currentUrl.origin
    },
    get protocol() {
      return currentUrl.protocol
    },
    get host() {
      return currentUrl.host
    },
    get pathname() {
      return currentUrl.pathname
    },
    get search() {
      return currentUrl.search
    },
    get hash() {
      return currentUrl.hash
    },
    reload,
    assign,
    replace,
  }

  const sessionStorage = {
    getItem: vi.fn((key: string) => (storage.has(key) ? storage.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, String(value))
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
  }

  const windowObj: Record<string, any> = {
    location,
    history: {
      pushState,
      replaceState,
      back,
    },
    sessionStorage,
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type)!.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      windowListeners.get(type)?.delete(listener)
    }),
    dispatchWindowEvent(type: string, event?: any) {
      for (const listener of [...(windowListeners.get(type) ?? [])]) {
        listener(event)
      }
    },
  }

  windowObj.self = windowObj
  windowObj.top = inIframe ? {} : windowObj

  const documentObj = {
    readyState,
    title: 'Alien (1979)',
    get cookie() {
      return cookieJar
    },
    set cookie(value: string) {
      cookieJar = value
    },
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set())
      documentListeners.get(type)!.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      documentListeners.get(type)?.delete(listener)
    }),
    dispatchDocumentEvent(type: string, event?: any) {
      for (const listener of [...(documentListeners.get(type) ?? [])]) {
        listener(event)
      }
    },
  }

  return {
    windowObj,
    documentObj,
    sessionStorage,
    reload,
    assign,
    replace,
    back,
    pushState,
    replaceState,
    setHref(nextHref: string) {
      currentUrl = new URL(nextHref)
    },
    getCookieRaw() {
      return cookieJar
    },
  }
}

function runInlineObserver(
  env: ReturnType<typeof createBrowserEnv>,
  {
    assureTypingInterval = 1200,
    zIndex = 9999,
    keepStegaOnCopy,
  }: {
    assureTypingInterval?: number
    zIndex?: number | string
    keepStegaOnCopy?: boolean
  } = {},
) {
  const runner = new Function(
    'window',
    'document',
    'sessionStorage',
    'assureTypingInterval',
    'zIndex',
    'keepStegaOnCopy',
    inlineScript,
  )
  runner(
    env.windowObj,
    env.documentObj,
    env.sessionStorage,
    assureTypingInterval,
    zIndex,
    keepStegaOnCopy,
  )
}

async function runModuleBridge(
  env: ReturnType<typeof createBrowserEnv>,
  enableVisualEditingMock: (options: Record<string, any>) => () => void,
  {isDev = false}: {isDev?: boolean} = {},
) {
  const transformed = await transformWithOxc(moduleScript, 'visual-editing-module.ts', {
    lang: 'ts',
  })
  const executable = transformed.code
    .replace(/import\.meta\.env\.DEV/g, String(isDev))
    .replace(
      /import\(["']@sanity\/visual-editing\/enable-visual-editing["']\)/g,
      'Promise.resolve({ enableVisualEditing: __deps.enableVisualEditing })',
    )
    .replace(
      /import\(["']\.\/history\.js["']\)/g,
      'Promise.resolve(__deps)',
    )

  const runner = new Function('window', 'document', '__deps', executable)
  runner(env.windowObj, env.documentObj, {
    enableVisualEditing: enableVisualEditingMock,
    applyPresentationHistoryUpdate,
    getPresentationUrl,
    shouldPublishUrl,
  })

  // Flush the Promise.all([...]).then(...) microtask chain
  await Promise.resolve()
  await Promise.resolve()
}

describe('visual-editing inline observer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dynamically imports enable-visual-editing and history inside the enabled guard without standalone CSS', () => {
    expect(astroSource).toContain('import("@sanity/visual-editing/enable-visual-editing")')
    expect(astroSource).toContain('import("./history.js")')
    expect(astroSource).not.toContain('@sanity/visual-editing-standalone')
    expect(astroSource).not.toContain('styles.css?raw')
  })

  it('exposes config but skips cookies and listeners when not in an iframe', () => {
    const env = createBrowserEnv({
      href: 'http://localhost:4321/movies?perspective=drafts',
      inIframe: false,
    })

    runInlineObserver(env)

    expect(env.windowObj.__sanityVEConfig).toBeDefined()
    expect(env.getCookieRaw()).toBe('')
    expect(env.replaceState).not.toHaveBeenCalled()
    expect(env.windowObj.addEventListener).not.toHaveBeenCalled()
  })

  it('syncs initial URL perspective to a host-isolated cookie and strips query params', () => {
    const env = createBrowserEnv({
      href: 'https://preview.example.com:8443/movies?sanity-preview-perspective=drafts&keep=1#hero',
    })

    runInlineObserver(env)

    expect(env.getCookieRaw()).toBe(
      'sanity-perspective-preview-example-com-8443=drafts; path=/; SameSite=None; Secure; Partitioned',
    )
    expect(env.replaceState).toHaveBeenCalledWith({}, '', '/movies?keep=1#hero')
    expect(env.windowObj.location.href).toBe('