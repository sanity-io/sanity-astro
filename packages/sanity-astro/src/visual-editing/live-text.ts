import {getDraftId, getVersionId, studioPath} from '@sanity/client/csm'
import {actor, isEmptyActor, listeners} from '@sanity/visual-editing/optimistic'
import {VERCEL_STEGA_REGEX, vercelStegaDecode, vercelStegaSplit} from '@vercel/stega'

/** Where a rendered string came from, decoded from the stega payload inside its text node. */
export interface TextSource {
  /** The exact document variant the page rendered from: `x`, `drafts.x` or `versions.r.x`. */
  documentId: string
  /** Studio path of the field inside that document, for example `sections[_key=="a"].title`. */
  path: string
  /** The invisible stega suffix. Re-appended after each patch so overlays keep working. */
  encoded: string
}

type StegaPayload = {origin?: unknown; href?: unknown}

// The upstream regex carries the `g` flag, which makes `test` stateful. Keep a plain copy.
const hasStega = new RegExp(VERCEL_STEGA_REGEX.source, 'u')

/**
 * Reads the edit intent URL that `@sanity/client` encodes into every stega string. The id is
 * always the published id; the `perspective` param says which variant the value came from.
 */
export function decodeTextSource(text: string): TextSource | undefined {
  if (!hasStega.test(text)) {
    return undefined
  }
  const payload = vercelStegaDecode<StegaPayload>(text)
  if (!payload || payload.origin !== 'sanity.io' || typeof payload.href !== 'string') {
    return undefined
  }
  let params: URLSearchParams
  try {
    params = new URL(payload.href, 'http://localhost').searchParams
  } catch {
    return undefined
  }
  const id = params.get('id')
  const path = params.get('path')
  if (!id || !path) {
    return undefined
  }
  const perspective = params.get('perspective')
  const documentId =
    perspective === 'published' ? id : perspective ? getVersionId(id, perspective) : getDraftId(id)
  return {documentId, path, encoded: vercelStegaSplit(text).encoded}
}

interface DocumentSnapshotLike {
  context: {local?: unknown; remote?: unknown}
}

type DatasetEvent = 'sync' | 'mutation' | 'rebased.remote' | 'rebased.local'

interface DatasetActorLike {
  getSnapshot(): {
    context: {documents: Record<string, {getSnapshot(): DocumentSnapshotLike} | undefined>}
  }
  on(event: DatasetEvent, handler: (event: {id: string}) => void): {unsubscribe(): void}
}

export interface LiveTextOptions {
  /** Called when a remote document changed so the page can reconcile what text alone cannot. */
  onRemoteChange: (documentId: string) => void
  root?: ParentNode
}

export interface LiveText {
  /** Brings every stega text node rendered from `documentId` to the document's latest value. */
  patch: (documentId: string) => number
  /** Re-indexes the DOM and patches every known document, for example after a morph. */
  patchAll: () => number
  /**
   * Whether freshly fetched HTML still shows values a document held before its latest change,
   * which means the server has not caught up with the mutation stream yet.
   */
  isStale: (fetched: ParentNode) => boolean
  dispose: () => void
}

/** How many past snapshots per document a text node may still be showing. */
const HISTORY_LENGTH = 8

/**
 * Keeps stega text nodes in sync with the document snapshots that Presentation streams to the
 * overlay's dataset mutator. A keystroke in the Studio reaches the DOM without a server round
 * trip; the morph that follows reconciles anything the text patch cannot express.
 *
 * A node is only rewritten when its text is a value the document held before. Text the page
 * transformed (truncated, upper-cased, formatted) never matches a raw value and is left to the
 * server render, and a morph that brought back older HTML is repaired from the history.
 */
export function createLiveText(options: LiveTextOptions): LiveText {
  const root = options.root ?? document.body
  // Rebuilt from scratch whenever the DOM changes: a morph keeps text node identity while
  // swapping the stega payload inside it, so a decoded source is only valid for one index.
  let index: Map<string, Map<Text, TextSource>> | undefined
  const history = new Map<string, unknown[]>()
  let patching = false
  let subscriptions: Array<{unsubscribe(): void}> = []

  const buildIndex = (from: ParentNode = root) => {
    const next = new Map<string, Map<Text, TextSource>>()
    const walker = (from.ownerDocument ?? document).createTreeWalker(from, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      const source = decodeTextSource(text.nodeValue ?? '')
      if (!source) {
        continue
      }
      let nodes = next.get(source.documentId)
      if (!nodes) {
        nodes = new Map()
        next.set(source.documentId, nodes)
      }
      nodes.set(text, source)
    }
    return next
  }

  const observer = new MutationObserver(() => {
    if (!patching) {
      index = undefined
    }
  })
  observer.observe(root, {childList: true, characterData: true, subtree: true})

  const record = (documentId: string) => {
    if (isEmptyActor(actor)) {
      return
    }
    const snapshot = (actor as unknown as DatasetActorLike).getSnapshot()
    const doc = snapshot.context.documents[documentId]?.getSnapshot().context.local
    if (!doc || typeof doc !== 'object') {
      return
    }
    const seen = history.get(documentId) ?? []
    if (seen[seen.length - 1] !== doc) {
      seen.push(doc)
      history.set(documentId, seen.slice(-HISTORY_LENGTH))
    }
  }

  /**
   * The latest value for a node when its text is one the document held earlier, `undefined`
   * when the text is already current or was never a raw value (the page transformed it).
   */
  const outdatedValue = (node: Text, source: TextSource): string | undefined => {
    const seen = history.get(source.documentId)
    if (!seen?.length) {
      return undefined
    }
    const value = studioPath.get(seen[seen.length - 1], source.path)
    if (typeof value !== 'string') {
      return undefined
    }
    const {cleaned} = vercelStegaSplit(node.nodeValue ?? '')
    if (cleaned === value) {
      return undefined
    }
    const wasHeld = seen.slice(0, -1).some((doc) => studioPath.get(doc, source.path) === cleaned)
    return wasHeld ? value : undefined
  }

  const patch = (documentId: string) => {
    const nodes = (index ??= buildIndex()).get(documentId)
    if (!nodes) {
      return 0
    }
    let changed = 0
    patching = true
    try {
      for (const [node, source] of nodes) {
        if (!node.isConnected) {
          nodes.delete(node)
          continue
        }
        const value = outdatedValue(node, source)
        if (value === undefined) {
          continue
        }
        node.nodeValue = value + source.encoded
        changed++
      }
    } finally {
      patching = false
    }
    return changed
  }

  const patchAll = () => {
    index = buildIndex()
    let changed = 0
    for (const documentId of index.keys()) {
      changed += patch(documentId)
    }
    return changed
  }

  const isStale = (fetched: ParentNode) => {
    for (const nodes of buildIndex(fetched).values()) {
      for (const [node, source] of nodes) {
        if (outdatedValue(node, source) !== undefined) {
          return true
        }
      }
    }
    return false
  }

  const bind = () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe()
    }
    subscriptions = []
    if (isEmptyActor(actor)) {
      return
    }
    const live = actor as unknown as DatasetActorLike
    subscriptions = [
      live.on('sync', ({id}) => record(id)),
      live.on('mutation', ({id}) => {
        record(id)
        patch(id)
        options.onRemoteChange(id)
      }),
      // A refetched snapshot (first load, reconnect) only matters when the DOM disagrees with it.
      live.on('rebased.remote', ({id}) => {
        record(id)
        if (patch(id) > 0) {
          options.onRemoteChange(id)
        }
      }),
      live.on('rebased.local', ({id}) => {
        record(id)
        patch(id)
      }),
    ]
  }

  listeners.add(bind)
  bind()

  return {
    patch,
    patchAll,
    isStale,
    dispose: () => {
      listeners.delete(bind)
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
      subscriptions = []
      observer.disconnect()
    },
  }
}
