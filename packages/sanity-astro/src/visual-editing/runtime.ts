import {createBrowserHistoryAdapter, type HistoryAdapter} from './history.js'
import {createLiveText} from './live-text.js'
import {fetchDocument, morphDocument} from './morph.js'
import {
  createRefresher,
  type HistoryRefresh,
  type Refresher,
  type RefreshStrategy,
} from './refresh.js'
import {reloadPreservingScroll, restoreScroll} from './scroll.js'

export interface Runtime {
  history: HistoryAdapter
  refresh: (payload: HistoryRefresh) => Promise<void> | false
  dispose: () => void
}

/**
 * Waits between fetches while the server still returns HTML older than the mutation stream.
 * After the last delay the HTML is applied as is; the settle pass and text patches finish it.
 */
const STALE_RETRY_DELAYS_MS = [250, 250, 500]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The browser side of Visual Editing for Astro pages: URL sync with Presentation, in-place
 * refresh with a reload fallback, and instant text patches from the document stream. Shared by
 * the `.astro` component and the deprecated React wrapper.
 */
export function createRuntime(strategy: RefreshStrategy): Runtime {
  restoreScroll()
  const history = createBrowserHistoryAdapter()
  let refresher: Refresher | undefined
  const liveText = createLiveText({onRemoteChange: () => refresher?.schedule()})

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

  refresher = createRefresher({
    strategy,
    morph,
    reload: () => reloadPreservingScroll(),
  })
  const {refresh, dispose: disposeRefresher} = refresher

  return {
    history,
    refresh,
    dispose: () => {
      liveText.dispose()
      disposeRefresher()
      history.dispose()
    },
  }
}
