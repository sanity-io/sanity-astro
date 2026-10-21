import {createDocumentStream} from './document-stream.js'
import {createLiveText} from './live-text.js'
import {fetchDocument, hasNewExecutableScript, morphDocument, stripHash} from './morph.js'
import {createDefaultRefresh, type ResolvedRefreshStrategy} from './refresh-strategy.js'
import {createRefresher, type HistoryRefresh, type MorphOutcome} from './refresh.js'

export type RefreshHandler = (payload: HistoryRefresh) => Promise<void> | false

export interface Runtime {
  /** The `refresh` option for `enableVisualEditing`. */
  refresh: RefreshHandler
  dispose: () => void
}

/**
 * Waits between fetches while the server still returns HTML older than the mutation stream.
 * After the last delay the HTML is applied as is; the settle pass and text patches finish it.
 */
const STALE_RETRY_DELAYS_MS = [250, 250, 500]

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * How the page refreshes when Presentation reports a change. The `'reload'` strategies (the
 * default) reload the page, plus the follow-up reload the strategy may ask for, and nothing else:
 * no stream subscription, no observers. With `'in-place'`, stega text is patched from the
 * document stream the moment a change arrives and fresh server HTML is morphed into the live
 * DOM, with a reload as the fallback.
 *
 * Call it when the page arrives: a reload strategy arms the follow-up reload a change-triggered
 * reload left behind, and `dispose` cancels it.
 */
export function createRuntime(
  strategy: ResolvedRefreshStrategy = {type: 'reload', followUpDelayMs: undefined},
): Runtime {
  if (strategy.type === 'reload') {
    const defaultRefresh = createDefaultRefresh(strategy, window)
    const cancelFollowUp = defaultRefresh.arrive()
    return {refresh: defaultRefresh.refresh, dispose: () => cancelFollowUp?.()}
  }

  const morph = async (signal: AbortSignal): Promise<MorphOutcome> => {
    const href = window.location.href
    // A client-side navigation or a teardown while the fetch was in flight makes its result,
    // fresh HTML or a failure alike, belong to a page that is no longer showing, so neither may
    // touch the page the editor is on now. An in-page `#anchor` jump does not.
    const superseded = () => signal.aborted || stripHash(window.location.href) !== stripHash(href)
    for (let attempt = 0; ; attempt++) {
      let next: Document
      try {
        next = await fetchDocument(href, fetch, signal)
      } catch {
        // A failed fetch, a non-HTML response or a redirect: whatever the server is doing, a
        // navigation shows it to the editor and a morph cannot.
        return superseded() ? 'applied' : 'reload'
      }
      if (superseded()) {
        return 'applied'
      }
      const delay = STALE_RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !liveText.isStale(next.body)) {
        if (hasNewExecutableScript(document, next)) {
          return 'reload'
        }
        morphDocument(document, next)
        liveText.patchAll()
        return 'applied'
      }
      await sleep(delay, signal)
    }
  }

  const refresher = createRefresher({morph, reload: () => window.location.reload()})
  const liveText = createLiveText({
    stream: createDocumentStream(),
    onRemoteChange: () => refresher.schedule(),
  })

  return {
    refresh: refresher.refresh,
    dispose: () => {
      liveText.dispose()
      refresher.dispose()
    },
  }
}
