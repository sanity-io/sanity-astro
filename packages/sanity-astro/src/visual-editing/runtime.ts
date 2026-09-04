import {createBrowserHistoryAdapter, type HistoryAdapter} from './history.js'
import {createLiveText} from './live-text.js'
import {fetchDocument, hasNewExecutableScript, morphDocument, stripHash} from './morph.js'
import {createRefresher, type HistoryRefresh, type RefreshStrategy} from './refresh.js'
import {reloadPreservingScroll, restoreScroll} from './scroll.js'

export type RefreshHandler = (payload: HistoryRefresh) => Promise<void> | false

export interface RuntimeOptions {
  strategy: RefreshStrategy
  /** Replaces URL sync with Presentation. The browser adapter is not installed when given. */
  history?: HistoryAdapter
  /**
   * Replaces the in-place refresh. It also receives a `mutation` payload for every document on
   * the page the stream reports, not only the one open in the Studio pane.
   */
  refresh?: RefreshHandler
}

export interface Runtime {
  history: HistoryAdapter
  refresh: RefreshHandler
  dispose: () => void
}

/**
 * Waits between fetches while the server still returns HTML older than the mutation stream.
 * After the last delay the HTML is applied as is; the settle pass and text patches finish it.
 */
const STALE_RETRY_DELAYS_MS = [250, 250, 500]

/** Rejects the morph so the refresher falls back to a reload, which does run the new script. */
class NewScriptError extends Error {
  constructor() {
    super('Fresh HTML introduces a script a morph cannot execute')
    this.name = 'NewScriptError'
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

type SnapshotLike = {_type?: unknown; _rev?: unknown}

function mutationPayload(documentId: string, document: unknown): HistoryRefresh {
  const snapshot = (document ?? {}) as SnapshotLike
  return {
    source: 'mutation',
    livePreviewEnabled: false,
    document: {
      _id: documentId,
      _type: typeof snapshot._type === 'string' ? snapshot._type : '',
      _rev: typeof snapshot._rev === 'string' ? snapshot._rev : '',
    },
  }
}

/**
 * The browser side of Visual Editing for Astro pages: URL sync with Presentation, in-place
 * refresh with a reload fallback, and instant text patches from the document stream. Shared by
 * the `.astro` component and the deprecated React wrapper.
 */
export function createRuntime(options: RuntimeOptions): Runtime {
  restoreScroll()
  const browserHistory = options.history ? undefined : createBrowserHistoryAdapter()
  const history = options.history ?? browserHistory!

  const morph = async (signal: AbortSignal) => {
    const href = window.location.href
    for (let attempt = 0; ; attempt++) {
      const next = await fetchDocument(href, fetch, signal)
      // A client-side navigation or a teardown while the fetch was in flight makes this HTML
      // belong to a page that is no longer showing. A hash change alone keeps the document.
      if (signal.aborted || stripHash(window.location.href) !== stripHash(href)) {
        return
      }
      if (attempt >= STALE_RETRY_DELAYS_MS.length || !liveText.isStale(next.body)) {
        if (hasNewExecutableScript(document, next)) {
          throw new NewScriptError()
        }
        morphDocument(document, next)
        liveText.patchAll()
        return
      }
      await sleep(STALE_RETRY_DELAYS_MS[attempt], signal)
    }
  }

  const refresher = createRefresher({
    strategy: options.strategy,
    morph,
    reload: () => reloadPreservingScroll(),
  })
  const refresh = options.refresh ?? refresher.refresh

  const liveText = createLiveText({
    onRemoteChange: (documentId, snapshot) => {
      if (options.refresh) {
        options.refresh(mutationPayload(documentId, snapshot))
      } else {
        refresher.schedule()
      }
    },
  })

  return {
    history,
    refresh,
    dispose: () => {
      liveText.dispose()
      refresher.dispose()
      browserHistory?.dispose()
    },
  }
}
