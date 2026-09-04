import {createBrowserHistoryAdapter, type HistoryAdapter} from './history'
import {createLiveText} from './live-text'
import {fetchDocument, morphDocument} from './morph'
import {createRefresher, type HistoryRefresh, type RefreshStrategy} from './refresh'
import {reloadPreservingScroll, restoreScroll} from './scroll'

export interface Runtime {
  /** Absent when created with `history: false`. */
  history?: HistoryAdapter
  /** Absent when created with `refresh: false`. */
  refresh?: (payload: HistoryRefresh) => Promise<void> | false
  dispose: () => void
}

export interface RuntimeOptions {
  /**
   * Sync the browser URL with Presentation. Pass `false` when the caller brings its own history
   * adapter, so `pushState`, `replaceState` and link clicks stay untouched.
   */
  history?: boolean
  /**
   * Refresh the page in place and patch stega text from the document stream. Pass `false` when
   * the caller brings its own `refresh`, so nothing competes with it.
   */
  refresh?: boolean
}

/**
 * Waits between fetches while the server still returns HTML older than the mutation stream.
 * After the last delay the HTML is applied as is; the settle pass and text patches finish it.
 */
const STALE_RETRY_DELAYS_MS = [250, 250, 500]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function createPageRefresh(strategy: RefreshStrategy) {
  restoreScroll()
  let schedule = () => {}
  const liveText = createLiveText({onRemoteChange: () => schedule()})

  const morph = async () => {
    for (let attempt = 0; ; attempt++) {
      const next = await fetchDocument(window.location.href)
      if (attempt >= STALE_RETRY_DELAYS_MS.length || !liveText.isStale(next.body)) {
        morphDocument(document, next)
        liveText.patchAll()
        return
      }
      await sleep(STALE_RETRY_DELAYS_MS[attempt])
    }
  }

  const refresher = createRefresher({
    strategy,
    morph,
    reload: () => reloadPreservingScroll(),
  })
  schedule = refresher.schedule

  return {
    refresh: refresher.refresh,
    dispose: () => {
      liveText.dispose()
      refresher.dispose()
    },
  }
}

/**
 * The browser side of Visual Editing for Astro pages: URL sync with Presentation, in-place
 * refresh with a reload fallback, and instant text patches from the document stream. Shared by
 * the `.astro` component and the deprecated React wrapper, which boots only the parts its caller
 * did not replace.
 */
export function createRuntime(
  strategy: RefreshStrategy,
  {history: withHistory = true, refresh: withRefresh = true}: RuntimeOptions = {},
): Runtime {
  const history = withHistory ? createBrowserHistoryAdapter() : undefined
  const refresh = withRefresh ? createPageRefresh(strategy) : undefined
  return {
    history,
    refresh: refresh?.refresh,
    dispose: () => {
      refresh?.dispose()
      history?.dispose()
    },
  }
}
