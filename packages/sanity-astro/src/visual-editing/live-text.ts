import {VERCEL_STEGA_REGEX, vercelStegaDecode} from '@vercel/stega'

import {type DocumentStream, variantId} from './document-stream.js'

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
  // Release perspectives resolve to a version id the overlays never stream: upstream observes
  // only the draft and published ids of documents on the page. Those runs stay unpatched and
  // wait for the morph instead.
  return {documentId: variantId(id, params.get('perspective')), path}
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

export interface LiveTextOptions {
  stream: DocumentStream
  /** Called when a remote document changed, so the page can reconcile what text alone cannot. */
  onRemoteChange: (documentId: string) => void
}

export interface LiveText {
  /** Re-indexes the DOM and patches every known document, for example after a morph. */
  patchAll: () => number
  /**
   * Whether freshly fetched HTML still shows values a document held before its latest change,
   * which means the server has not caught up with the mutation stream yet. Reads calibration
   * state and never writes it, so it can be asked about HTML that may be discarded.
   */
  isStale: (fetched: ParentNode) => boolean
  dispose: () => void
}

/** How many raw values per rendered field are remembered, so stale server HTML can be recognised. */
const FIELD_HISTORY_LENGTH = 64

/**
 * What is known about one rendered field. `values` are the raw strings the field has held,
 * newest last. `verbatim` is whether the page shows the raw value, decided by server renders
 * only and revised by each one that can tell. `hit` is the pass whose render last showed the
 * raw value, so a field the page renders both raw and transformed keeps patching the raw copy.
 */
interface FieldState {
  verbatim: boolean
  hit: number | undefined
  values: string[]
}

/** A run that shows an older value of a field the page renders verbatim. */
interface StaleRun {
  run: StegaRun
  /** The field's current raw value. */
  value: string
  /** The older value the run shows on screen. */
  shown: string
}

/** The text the run's value occupies, which is the tail of the run's segment. */
const renderedValue = (text: string, run: StegaRun, length: number) =>
  length <= run.valueEnd - run.from ? text.slice(run.valueEnd - length, run.valueEnd) : undefined

/**
 * Whether the run shows `candidate` as its value. Every string ends with the empty one, so it
 * counts only when the segment holds nothing but template whitespace: the fallback a template
 * renders for an empty field is not the field's value.
 */
const shows = (text: string, run: StegaRun, candidate: string) =>
  candidate === ''
    ? text.slice(run.from, run.valueEnd).trim() === ''
    : renderedValue(text, run, candidate.length) === candidate

/**
 * Keeps stega text nodes in sync with the document snapshots that Presentation streams to the
 * overlays' dataset mutator. A keystroke in the Studio reaches the DOM without a server round
 * trip; the morph that follows reconciles anything the text patch cannot express.
 *
 * Patching works on the stega payload's own segment of a text node, so surrounding template
 * whitespace and neighbouring interpolations are left untouched. A segment is rewritten only
 * when the page was seen rendering that field verbatim and the segment still ends with a value
 * the field held before. Transformed text does not calibrate as verbatim, so it is left to the
 * server render, and a morph that brought back older HTML is repaired from the field history.
 *
 * Calibration reads server renders only: the page as loaded and the page after each morph.
 * Text seen between a change and its morph is behind by construction and never decides. A
 * render that shows the raw value turns patching on and one that shows text the field never
 * held turns it off, so the verdict follows the server rather than locking in: a page that
 * loaded while the editor typed, or a morph that was behind the stream, is corrected by the
 * first render that has caught up, and a transform that happens to leave one value unchanged
 * costs a single patch rather than every one after it. A render that shows an older value is
 * the server behind the stream; it decides nothing and is repaired from the field history.
 */
export function createLiveText(options: LiveTextOptions): LiveText {
  const {stream} = options
  // Rebuilt whenever the DOM changes: a morph keeps text node identity while swapping the stega
  // payload inside it, so a decoded run is only valid for one index.
  let index: Map<string, Set<Text>> | undefined
  const fields = new Map<string, Map<string, FieldState>>()
  let patching = false
  let disposed = false
  // Bumped once per pass, so renders of one pass are told apart from the next.
  let pass = 0
  // Set by a server render that could not tell a stale page from a transform.
  let inconclusive = false

  const buildIndex = (from: ParentNode = document.body) => {
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
  observer.observe(document.documentElement, {childList: true, characterData: true, subtree: true})

  /** The field's current raw value in the snapshot the run points at, when it is a string. */
  const valueOf = (run: StegaRun) => {
    const value = stream.readField(run.source.documentId, run.source.path)
    return typeof value === 'string' ? value : undefined
  }

  const fieldFor = (source: TextSource) => {
    let byPath = fields.get(source.documentId)
    if (!byPath) {
      byPath = new Map()
      fields.set(source.documentId, byPath)
    }
    let field = byPath.get(source.path)
    if (!field) {
      field = {verbatim: false, hit: undefined, values: []}
      byPath.set(source.path, field)
    }
    return field
  }

  /**
   * One server render's verdict on a field. The raw value on screen proves it verbatim; an
   * older value is the server behind the stream and proves nothing; anything else is a
   * transform. A raw copy seen earlier in the same pass outranks a transformed copy of the same
   * field elsewhere on the page.
   */
  const calibrate = (text: string, run: StegaRun, field: FieldState, value: string) => {
    if (shows(text, run, value)) {
      field.verbatim = true
      field.hit = pass
    } else if (field.hit !== pass && !field.values.some((older) => shows(text, run, older))) {
      field.verbatim = false
      // With no history, a page rendered before the editor's latest change looks exactly like
      // a transform, so only a render that has caught up can decide.
      if (field.values.length === 0) {
        inconclusive = true
      }
    }
  }

  /** Records the field's current raw value and, on a server render, calibrates the field. */
  const observe = (text: string, run: StegaRun, value: string, render: boolean) => {
    const field = fieldFor(run.source)
    if (render) {
      calibrate(text, run, field, value)
    }
    if (field.values[field.values.length - 1] !== value) {
      field.values.push(value)
      if (field.values.length > FIELD_HISTORY_LENGTH) {
        field.values.splice(0, field.values.length - FIELD_HISTORY_LENGTH)
      }
    }
  }

  /**
   * The stale value the run currently shows, when the field is verbatim and behind. The longest
   * candidate wins: a shorter value that is merely a suffix of the text on screen would splice
   * into the middle of it (`rival` inside `Arrival`) or read as already current (`bar` inside
   * `foobar`).
   */
  const staleValue = (text: string, run: StegaRun, field: FieldState, value: string) => {
    if (!field.verbatim) {
      return undefined
    }
    let shown: string | undefined
    for (const candidate of [...field.values, value]) {
      if (shows(text, run, candidate) && (shown === undefined || candidate.length > shown.length)) {
        shown = candidate
      }
    }
    return shown === undefined || shown === value ? undefined : shown
  }

  /** The runs in `text` that still show an older value. Never writes calibration state. */
  const staleRuns = (text: string, runs: StegaRun[]) => {
    const stale: StaleRun[] = []
    for (const run of runs) {
      const value = valueOf(run)
      const field = fields.get(run.source.documentId)?.get(run.source.path)
      if (value === undefined || !field) {
        continue
      }
      const shown = staleValue(text, run, field, value)
      if (shown !== undefined) {
        stale.push({run, value, shown})
      }
    }
    return stale
  }

  /** Observes every field the node renders, then rewrites the stale runs in place. */
  const patchNode = (node: Text, render: boolean) => {
    let text = node.nodeValue ?? ''
    const runs = findStegaRuns(text)
    for (const run of runs) {
      const value = valueOf(run)
      if (value !== undefined) {
        observe(text, run, value, render)
      }
    }
    const stale = staleRuns(text, runs)
    // Right to left, so the offsets of earlier runs stay valid.
    stale.reverse()
    for (const {run, value, shown} of stale) {
      text = text.slice(0, run.valueEnd - shown.length) + value + text.slice(run.valueEnd)
    }
    if (stale.length > 0) {
      patching = true
      node.nodeValue = text
      // The observer fires asynchronously, so drain its queue before releasing the guard.
      observer.takeRecords()
      patching = false
    }
    return stale.length
  }

  /** Patches every node rendered from `documentId`. `render` marks the DOM as a server render. */
  const patch = (documentId: string, render: boolean) => {
    if (disposed) {
      return 0
    }
    pass++
    const nodes = (index ??= buildIndex()).get(documentId)
    if (!nodes) {
      return 0
    }
    let changed = 0
    for (const node of nodes) {
      if (!node.isConnected) {
        nodes.delete(node)
        continue
      }
      changed += patchNode(node, render)
    }
    return changed
  }

  const patchAll = () => {
    if (disposed) {
      return 0
    }
    pass++
    index = buildIndex()
    // The preview never navigates away, so forget fields whose documents left the page.
    for (const documentId of fields.keys()) {
      if (!index.has(documentId)) {
        fields.delete(documentId)
      }
    }
    let changed = 0
    for (const nodes of index.values()) {
      for (const node of nodes) {
        changed += patchNode(node, true)
      }
    }
    return changed
  }

  const isStale = (fetched: ParentNode) => {
    for (const nodes of buildIndex(fetched).values()) {
      for (const node of nodes) {
        const text = node.nodeValue ?? ''
        if (staleRuns(text, findStegaRuns(text)).length > 0) {
          return true
        }
      }
    }
    return false
  }

  const unsubscribe = stream.subscribe({
    // The page was rendered from the snapshot the first sync delivers, unless it loaded while
    // the editor typed. Nothing else would render the page again before the next change, so
    // a field this render cannot decide asks for a reconcile; the morph and its settle pass
    // calibrate it against the history recorded here.
    'sync': (id) => {
      inconclusive = false
      patch(id, true)
      if (inconclusive) {
        options.onRemoteChange(id)
      }
    },
    'mutation': (id) => {
      patch(id, false)
      options.onRemoteChange(id)
    },
    // A refetched snapshot (first load, reconnect) only matters when the DOM disagrees with it.
    'rebased.remote': (id) => {
      if (patch(id, false) > 0) {
        options.onRemoteChange(id)
      }
    },
    'rebased.local': (id) => void patch(id, false),
  })

  return {
    patchAll,
    isStale,
    dispose: () => {
      disposed = true
      unsubscribe()
      observer.disconnect()
    },
  }
}
