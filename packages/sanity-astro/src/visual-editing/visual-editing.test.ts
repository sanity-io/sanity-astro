import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {transformWithEsbuild} from 'vite'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

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
  const replaceState = vi.fn((_state: unknown, _unused: string, nextUrl: string) => {
    currentUrl = new URL(nextUrl, currentUrl.origin)
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
  enableVisualEditingMock: ReturnType<typeof vi.fn>,
) {
  const transformed = await transformWithEsbuild(moduleScript, 'visual-editing-module.ts', {
    loader: 'ts',
    format: 'esm',
  })
  const executable = transformed.code.replace(
    /import\s*\{[^}]*enableVisualEditing[^}]*}\s*from\s*["']@sanity\/visual-editing-standalone["'];?/,
    'const { enableVisualEditing } = __deps;',
  )

  const runner = new Function('window', 'document', '__deps', executable)
  runner(env.windowObj, env.documentObj, {enableVisualEditing: enableVisualEditingMock})
}

describe('visual-editing inline observer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(env.windowObj.location.href).toBe('https://preview.example.com:8443/movies?keep=1#hero')
  })

  it('switches perspective via postMessage and array payloads only when changed', () => {
    const env = createBrowserEnv({
      href: 'http://localhost:4321/movies',
      initialCookie: 'sanity-perspective-localhost-4321=published',
    })

    runInlineObserver(env)

    // Identical perspective does not reload
    env.windowObj.dispatchWindowEvent('message', {
      data: {type: 'presentation/perspective', data: {perspective: 'published'}},
    })
    expect(env.reload).not.toHaveBeenCalled()

    // Changed perspective updates cookie and reloads
    env.windowObj.__sanityVEConfig.syncPerspective(['r1', 'drafts'])
    expect(env.getCookieRaw()).toContain('sanity-perspective-localhost-4321=r1%2Cdrafts')
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('ignores welcome and reconnect snapshot events without setting flag or reloading', () => {
    const env = createBrowserEnv()
    runInlineObserver(env, {assureTypingInterval: 1200})

    env.windowObj.dispatchWindowEvent('message', {
      data: {type: 'presentation/snapshot-event', data: {event: {type: 'welcome'}}},
    })
    env.windowObj.dispatchWindowEvent('message', {
      data: {type: 'presentation/snapshot-event', data: {event: {type: 'reconnect'}}},
    })

    expect(env.sessionStorage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('coalesces rapid mutation snapshot events into a single reload', () => {
    const env = createBrowserEnv({href: 'http://localhost:4321/movies/alien'})
    runInlineObserver(env, {assureTypingInterval: 1200})

    env.windowObj.dispatchWindowEvent('message', {
      data: {type: 'presentation/snapshot-event', data: {event: {type: 'mutation'}}},
    })
    expect(env.sessionStorage.setItem).toHaveBeenCalledWith(
      'sanity_sync_needed',
      'http://localhost:4321/movies/alien',
    )

    vi.advanceTimersByTime(800)
    expect(env.reload).not.toHaveBeenCalled()

    // Second keystroke pushes the timer back by another 1200ms
    env.windowObj.dispatchWindowEvent('message', {
      data: {type: 'presentation/snapshot-event', data: {event: {type: 'mutation'}}},
    })

    vi.advanceTimersByTime(800)
    expect(env.reload).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(env.sessionStorage.removeItem).toHaveBeenCalledWith('sanity_sync_needed')
  })

  it('defers manual and zero-interval mutation refreshes to a macrotask so Comlink settles', () => {
    const env = createBrowserEnv()
    runInlineObserver(env, {assureTypingInterval: 0})

    env.windowObj.__sanityVEConfig.triggerImmediateReload()
    expect(env.reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(env.reload).toHaveBeenCalledTimes(1)

    env.windowObj.__sanityVEConfig.onMutationRefresh()
    expect(env.reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(0)
    expect(env.reload).toHaveBeenCalledTimes(2)
  })

  it('reconciles URL-scoped follow-up flag on window.load and ignores flags from other URLs', () => {
    const env = createBrowserEnv({href: 'http://localhost:4321/movies/alien'})
    runInlineObserver(env, {assureTypingInterval: 1200})

    // Matching URL schedules follow-up reload
    env.sessionStorage.setItem('sanity_sync_needed', 'http://localhost:4321/movies/alien')
    env.windowObj.dispatchWindowEvent('load')

    expect(env.sessionStorage.removeItem).toHaveBeenCalledWith('sanity_sync_needed')
    vi.advanceTimersByTime(1200)
    expect(env.reload).toHaveBeenCalledTimes(1)

    // Mismatched URL (user navigated to another page) clears flag without reloading
    env.sessionStorage.setItem('sanity_sync_needed', 'http://localhost:4321/movies/other')
    env.windowObj.dispatchWindowEvent('load')

    vi.advanceTimersByTime(1200)
    expect(env.reload).toHaveBeenCalledTimes(1)
  })
})

describe('visual-editing module bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wires enableVisualEditing refresh, history adapter, and pagehide cleanup', async () => {
    const env = createBrowserEnv({href: 'http://localhost:4321/movies/alien?draft=1#cast'})
    runInlineObserver(env, {assureTypingInterval: 1200, zIndex: 42, keepStegaOnCopy: true})

    const cleanupSpy = vi.fn()
    const enableVisualEditingMock = vi.fn(() => cleanupSpy)

    await runModuleBridge(env, enableVisualEditingMock)

    expect(enableVisualEditingMock).toHaveBeenCalledTimes(1)
    const options = enableVisualEditingMock.mock.calls[0][0]
    expect(options.zIndex).toBe(42)
    expect(options.keepStegaOnCopy).toBe(true)

    // 1. Refresh callback contract
    await expect(options.refresh({source: 'manual'})).resolves.toBeUndefined()
    expect(env.reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(env.reload).toHaveBeenCalledTimes(1)

    expect(options.refresh({source: 'unknown'})).toBe(false)

    // 2. History subscribe & update contract
    const navigateSpy = vi.fn()
    const unsubscribeHistory = options.history.subscribe(navigateSpy)

    expect(navigateSpy).toHaveBeenCalledWith({
      type: 'push',
      title: 'Alien (1979)',
      url: '/movies/alien?draft=1#cast',
    })

    // Duplicate URL is not re-published
    env.windowObj.dispatchWindowEvent('popstate')
    expect(navigateSpy).toHaveBeenCalledTimes(1)

    // Changed URL publishes on popstate
    env.setHref('http://localhost:4321/movies/blade-runner')
    env.windowObj.dispatchWindowEvent('popstate')
    expect(navigateSpy).toHaveBeenLastCalledWith({
      type: 'push',
      title: 'Alien (1979)',
      url: '/movies/blade-runner',
    })

    // History update routes push/replace/pop
    options.history.update({type: 'push', url: '/movies/solaris'})
    expect(env.assign).toHaveBeenCalledWith('/movies/solaris')

    options.history.update({type: 'replace', url: '/movies/stalker'})
    expect(env.replace).toHaveBeenCalledWith('/movies/stalker')

    options.history.update({type: 'pop', url: '/movies/alien'})
    expect(env.back).toHaveBeenCalledTimes(1)

    unsubscribeHistory()
    expect(env.windowObj.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function))
    expect(env.windowObj.removeEventListener).toHaveBeenCalledWith(
      'hashchange',
      expect.any(Function),
    )

    // 3. Pagehide tears down enableVisualEditing
    env.windowObj.dispatchWindowEvent('pagehide')
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  it('forwards string zIndex and leaves keepStegaOnCopy undefined when omitted', async () => {
    const env = createBrowserEnv()
    runInlineObserver(env, {zIndex: 'var(--overlay-z)'})

    const enableVisualEditingMock = vi.fn(() => vi.fn())
    await runModuleBridge(env, enableVisualEditingMock)

    const options = enableVisualEditingMock.mock.calls[0][0]
    expect(options.zIndex).toBe('var(--overlay-z)')
    expect(options.keepStegaOnCopy).toBeUndefined()
  })
})