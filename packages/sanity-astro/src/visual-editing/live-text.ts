import {getDraftId, getVersionId, studioPath} from '@sanity/client/csm'
import {actor, isEmptyActor, listeners} from '@sanity/visual-editing/optimistic'
import {VERCEL_STEGA_REGEX, vercelStegaDecode} from '@vercel/stega'

/** Where a rendered string came from, decoded from the stega payload inside its text node. */
export interface TextSource {
  /** The exact document variant the page rendered from: `x`, `drafts.x` or `versions.r.x`. */
  documentId: string
  /** Studio path of the field inside that document, for example `sections[_key=="a"].title`. */
  path: string
}

type StegaPayload = {origin?: unknown; href?: unknown}

/**
 * One stega payload inside a text node. `@sanity/client` appends the payload directly after the
 * value, so the value is the run of characters ending where `encoded` begins. `from` is where the
 * previous payload ended, which bounds how far back the value can reach.
 */
export interface StegaRun {
  source: TextSource
  from: number
  valueEnd: number
  encoded: string
}

// The upstream regex carries the `g` flag, so give each scan its own instance.
const stegaRuns = () => new RegExp(VERCEL_STEGA_REGEX.source, 'gu')

function decodePayload(encoded: string): TextSource | undefined {
  let payload: StegaPayload | undefined
  try {
    payload = vercelStegaDecode<StegaPayload>(encoded)
  } catch {
    // Text can carry four or more zero-width characters without being a stega payload, and the
    // decoder throws rather than returning undefined on those.
    return undefined
  }
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
  return {documentId, path}
}

/**
 * Splits a text node's value into the stega payloads it carries, in order. A node holds more
 * than one when a template interpolates several fields next to each other.
 */
export function findStegaRuns(text: string): StegaRun[] {
  const runs: StegaRun[] = []
  const pattern = stegaRuns()
  let from = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const source = decodePayload(match[0])
    if (source) {
      runs.push({source, from, valueEnd: match.index, encoded: match[0]})
    }
    from = match.index + match[0].length
  }
  return runs
}

/** The decoded source of the first payload in a string, for callers that only need the target. */
export function decodeTextSource(text: string): TextSource | undefined {
  return findStegaRuns(text)[0]?.source
}

interface DocumentSnapshotLike {
  context: {local?: unknown}
}

type DatasetEvent = 'sync' | 'mutation' | 'rebased.remote' | 'rebased.local'

interface DatasetActorLike {
  getSnapshot(): {
    context: {documents: Record<string, {getSnapshot(): DocumentSnapshotLike} | undefined>}
  }
  on(event: DatasetEvent, handler: (event: {id: string}) => void): {unsubscribe(): void}
}

export interface LiveTextOptions {
  /**
   * Called when a remote document changed so the page can reconcile what text alone cannot.
   * `document` is the latest snapshot, or `undefined` when the actor no longer holds one.
   */
  onRemoteChange: (documentId: string, document: unknown) => void
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
 * whether any rendering showed the raw value in the pass that first saw the field. `values` are
 * the raw strings the field has held, newest last.
 */
interface FieldState {
  verbatim: boolean
  values: string[]
  /** The pass that first saw this field, the only pass allowed to decide `verbatim`. */
  pass: number
}

const fieldKey = (source: TextSource) => `${source.documentId}\u0000${source.path}`

/** The text the run's value occupies, which is the tail of the run's segment. */
const renderedValue = (text: string, run: StegaRun, length: number) =>
  length <= run.valueEnd - run.from ? text.slice(run.valueEnd - length, run.valueEnd) : undefined

/**
 * Keeps stega text nodes in sync with the document snapshots that Presentation streams to the
 * overlay's dataset mutator. A keystroke in the Studio reaches the DOM without a server round
 * trip; the morph that follows reconciles anything the text patch cannot express.
 *
 * Patching works on the stega payload's own segment of a text node, so surrounding template
 * whitespace and neighbouring interpolations are left untouched. A segment is rewritten only
 * when the page was seen rendering that field verbatim and the segment still ends with a value
 * the field held before. Transformed text never calibrates as verbatim, so it is left to the
 * server render, and a morph that brought back older HTML is repaired from the field history.
 */
export function createLiveText(options: LiveTextOptions): LiveText {
  const root = () => options.root ?? document.body
  // Rebuilt whenever the DOM changes: a morph keeps text node identity while swapping the stega
  // payload inside it, so a decoded run is only valid for one index.
  let index: Map<string, Set<Text>> | undefined
  const fields = new Map<string, FieldState>()
  let patching = false
  let disposed = false
  // Bumped once per patch pass so every rendering of a newly seen field gets a say in
  // calibration, while a later pass can never flip the decision.
  let pass = 0
  let subscriptions: Array<{unsubscribe(): void}> = []

  const buildIndex = (from: ParentNode = root()) => {
    const next = new Map<string, Set<Text>>()
    const walker = (from.ownerDocument ?? document).createTreeWalker(from, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      for (const run of findStegaRuns(text.nodeValue ?? '')) {
        let nodes = next.get(run.source.documentId)
        if (!nodes) {
          nodes = new Set()
          next.set(run.source.documentId, nodes)
        }
        nodes.add(text)
      }
    }
    return next
  }

  // Watching the root element rather than the body survives a body swap by Astro's router.
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

  /**
   * Records the field's current raw value. Verbatim is decided the first time the field is seen
   * with a snapshot: a later match could be the raw value passing through the page's transform,
   * and rewriting transformed text is worse than falling back to the morph.
   */
  const observe = (text: string, run: StegaRun, value: string) => {
    const key = fieldKey(run.source)
    let field = fields.get(key)
    if (!field) {
      field = {verbatim: false, values: [], pass}
      fields.set(key, field)
    }
    if (field.pass === pass) {
      field.verbatim ||= renderedValue(text, run, value.length) === value
    }
    if (field.values[field.values.length - 1] !== value) {
      field.values.push(value)
      if (field.values.length > FIELD_HISTORY_LENGTH) {
        field.values.splice(0, field.values.length - FIELD_HISTORY_LENGTH)
      }
    }
    return field
  }

  /** The stale value the run currently shows, when the field is verbatim and behind. */
  const staleValue = (text: string, run: StegaRun, field: FieldState, value: string) => {
    if (!field.verbatim || renderedValue(text, run, value.length) === value) {
      return undefined
    }
    return field.values.find(
      (held) => held !== value && renderedValue(text, run, held.length) === held,
    )
  }

  /** Rewrites every stale run in one node, right to left so earlier offsets stay valid. */
  const patchNode = (node: Text, docs: Map<string, unknown>, apply: boolean) => {
    let text = node.nodeValue ?? ''
    const runs = findStegaRuns(text)
    let changed = 0
    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i]
      const doc = docs.get(run.source.documentId)
      if (!doc) {
        continue
      }
      const value = studioPath.get(doc, run.source.path)
      if (typeof value !== 'string') {
        continue
      }
      const field = observe(text, run, value)
      const stale = staleValue(text, run, field, value)
      if (stale === undefined) {
        continue
      }
      changed++
      if (!apply) {
        continue
      }
      text = text.slice(0, run.valueEnd - stale.length) + value + text.slice(run.valueEnd)
    }
    if (apply && changed > 0) {
      patching = true
      node.nodeValue = text
      // The observer fires asynchronously, so drain its queue before releasing the guard.
      observer.takeRecords()
      patching = false
    }
    return changed
  }

  const snapshotsFor = (documentIds: Iterable<string>) => {
    const docs = new Map<string, unknown>()
    for (const documentId of documentIds) {
      const doc = readDocument(documentId)
      if (doc) {
        docs.set(documentId, doc)
      }
    }
    return docs
  }

  const patch = (documentId: string) => {
    if (disposed) {
      return 0
    }
    pass++
    const nodes = (index ??= buildIndex()).get(documentId)
    if (!nodes) {
      return 0
    }
    const docs = snapshotsFor([documentId])
    if (docs.size === 0) {
      return 0
    }
    let changed = 0
    for (const node of nodes) {
      if (!node.isConnected) {
        nodes.delete(node)
        continue
      }
      changed += patchNode(node, docs, true)
    }
    return changed
  }

  const patchAll = () => {
    if (disposed) {
      return 0
    }
    pass++
    index = buildIndex()
    const docs = snapshotsFor(index.keys())
    // The preview never navigates away, so forget fields whose documents left the page.
    for (const key of fields.keys()) {
      if (!index.has(key.slice(0, key.indexOf('\u0000')))) {
        fields.delete(key)
      }
    }
    let changed = 0
    for (const nodes of index.values()) {
      for (const node of nodes) {
        changed += patchNode(node, docs, true)
      }
    }
    return changed
  }

  const isStale = (fetched: ParentNode) => {
    pass++
    const fetchedIndex = buildIndex(fetched)
    const docs = snapshotsFor(fetchedIndex.keys())
    for (const nodes of fetchedIndex.values()) {
      for (const node of nodes) {
        if (patchNode(node, docs, false) > 0) {
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
        options.onRemoteChange(id, readDocument(id))
      }),
      // A refetched snapshot (first load, reconnect) only matters when the DOM disagrees with it.
      live.on('rebased.remote', ({id}) => {
        if (patch(id) > 0) {
          options.onRemoteChange(id, readDocument(id))
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
