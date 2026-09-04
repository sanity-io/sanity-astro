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

/** How many raw values per rendered field are remembered, so stale server HTML can be recognised. */
const FIELD_HISTORY_LENGTH = 64

/**
 * What is known about one rendered field, keyed by document variant and path. `verbatim` is
 * whether the page showed the raw value when the field was first seen. `values` are the raw
 * strings the field has held, newest last.
 */
interface FieldState {
  verbatim: boolean
  values: string[]
}

const fieldKey = (source: TextSource) => `${source.documentId}\u0000${source.path}`

/**
 * Keeps stega text nodes in sync with the document snapshots that Presentation streams to the
 * overlay's dataset mutator. A keystroke in the Studio reaches the DOM without a server round
 * trip; the morph that follows reconciles anything the text patch cannot express.
 *
 * A node is rewritten only when the page has been seen rendering that field verbatim and the
 * node currently shows a value the field held before. Transformed text (upper-cased, trimmed,
 * concatenated) never passes the verbatim check, so it is left to the server render, and a
 * morph that brought back older HTML is repaired from the field history.
 */
export function createLiveText(options: LiveTextOptions): LiveText {
  const body = () => options.root ?? document.body
  // Rebuilt from scratch whenever the DOM changes: a morph keeps text node identity while
  // swapping the stega payload inside it, so a decoded source is only valid for one index.
  let index: Map<string, Map<Text, TextSource>> | undefined
  const fields = new Map<string, FieldState>()
  let patching = false
  let disposed = false
  let subscriptions: Array<{unsubscribe(): void}> = []

  const buildIndex = (from: ParentNode = body()) => {
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

  // Observing the root element rather than the body survives a body swap by Astro's router.
  const observer = new MutationObserver(() => {
    if (!patching) {
      index = undefined
    }
  })
  observer.observe(options.root ?? document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  })

  const readDocument = (documentId: string): unknown => {
    if (isEmptyActor(actor)) {
      return undefined
    }
    const snapshot = (actor as unknown as DatasetActorLike).getSnapshot()
    const doc = snapshot.context.documents[documentId]?.getSnapshot().context.local
    return doc && typeof doc === 'object' ? doc : undefined
  }

  const cleanedText = (node: Text) => vercelStegaSplit(node.nodeValue ?? '').cleaned

  /**
   * Records the field's current raw value. Verbatim is decided the first time the field is
   * seen with a snapshot: a later match could be the raw value passing through the page's
   * transform, and rewriting transformed text is worse than falling back to the morph.
   */
  const observe = (node: Text, source: TextSource, value: string) => {
    const key = fieldKey(source)
    const field = fields.get(key) ?? {verbatim: cleanedText(node) === value, values: []}
    if (field.values[field.values.length - 1] !== value) {
      field.values.push(value)
      if (field.values.length > FIELD_HISTORY_LENGTH) {
        field.values.splice(0, field.values.length - FIELD_HISTORY_LENGTH)
      }
    }
    fields.set(key, field)
    return field
  }

  /**
   * The latest value for a node when the field is rendered verbatim and the node still shows a
   * value the field held earlier; `undefined` when the text is current or was transformed.
   */
  const outdatedValue = (node: Text, source: TextSource, field: FieldState, value: string) => {
    if (!field.verbatim) {
      return undefined
    }
    const cleaned = cleanedText(node)
    if (cleaned === value || !field.values.includes(cleaned)) {
      return undefined
    }
    return value
  }

  const patch = (documentId: string) => {
    if (disposed) {
      return 0
    }
    const nodes = (index ??= buildIndex()).get(documentId)
    const doc = readDocument(documentId)
    if (!nodes || !doc) {
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
        const value = studioPath.get(doc, source.path)
        if (typeof value !== 'string') {
          continue
        }
        const field = observe(node, source, value)
        if (outdatedValue(node, source, field, value) === undefined) {
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
    if (disposed) {
      return 0
    }
    index = buildIndex()
    let changed = 0
    for (const documentId of index.keys()) {
      changed += patch(documentId)
    }
    return changed
  }

  const isStale = (fetched: ParentNode) => {
    for (const [documentId, nodes] of buildIndex(fetched)) {
      const doc = readDocument(documentId)
      if (!doc) {
        continue
      }
      for (const [node, source] of nodes) {
        const field = fields.get(fieldKey(source))
        const value = studioPath.get(doc, source.path)
        if (!field || typeof value !== 'string') {
          continue
        }
        if (outdatedValue(node, source, field, value) !== undefined) {
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
      // The first snapshot calibrates which fields the page renders verbatim.
      live.on('sync', ({id}) => patch(id)),
      live.on('mutation', ({id}) => {
        patch(id)
        options.onRemoteChange(id)
      }),
      // A refetched snapshot (first load, reconnect) only matters when the DOM disagrees with it.
      live.on('rebased.remote', ({id}) => {
        if (patch(id) > 0) {
          options.onRemoteChange(id)
        }
      }),
      live.on('rebased.local', ({id}) => patch(id)),
    ]
  }

  listeners.add(bind)
  bind()

  return {
    patch,
    patchAll,
    isStale,
    dispose: () => {
      disposed = true
      listeners.delete(bind)
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
      subscriptions = []
      observer.disconnect()
    },
  }
}
