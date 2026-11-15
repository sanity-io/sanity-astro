import {studioPath} from '@sanity/client/csm'
import {actor, isEmptyActor, listeners} from '@sanity/visual-editing/optimistic'

/*
 * The seam between live text and the overlays. Everything imported above is upstream plumbing
 * rather than public API: `actor` and `listeners` are the module state behind the React hooks
 * in `@sanity/visual-editing/optimistic`, the `getSnapshot().context` nesting is the machine
 * layout of `@sanity/mutate`, and `studioPath` is tagged `@internal` in `@sanity/client/csm`.
 * When one of them moves, this is the file that changes; live text only sees `DocumentStream`.
 */

export type DocumentStreamEvent = 'sync' | 'mutation' | 'rebased.remote' | 'rebased.local'

export type DocumentStreamHandlers = Partial<
  Record<DocumentStreamEvent, (documentId: string) => void>
>

export interface DocumentStream {
  /** The field's value in the overlays' latest local snapshot of `documentId`, if both exist. */
  readField(documentId: string, path: string): unknown
  /** Delivers events until the returned function runs, following the overlays' actor as it changes. */
  subscribe(handlers: DocumentStreamHandlers): () => void
}

const EVENTS: readonly DocumentStreamEvent[] = [
  'sync',
  'mutation',
  'rebased.remote',
  'rebased.local',
]

/**
 * The id the stream uses for the document variant a stega payload points at. `createEditUrl`
 * always writes the published id and names the perspective separately: `published`, a release
 * name, or nothing for the draft.
 */
export function variantId(publishedId: string, perspective: string | null): string {
  if (perspective === 'published') {
    return publishedId
  }
  if (!perspective || perspective === 'drafts') {
    return `drafts.${publishedId}`
  }
  return `versions.${perspective}.${publishedId}`
}

/** The slice of the dataset mutator's actor that live text relies on. */
interface DatasetActor {
  getSnapshot(): {
    context: {documents: Record<string, {getSnapshot(): {context: {local?: unknown}}} | undefined>}
  }
  on(event: DocumentStreamEvent, handler: (event: {id?: unknown}) => void): {unsubscribe(): void}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isDatasetActor = (value: unknown): value is DatasetActor =>
  isObject(value) && typeof value.getSnapshot === 'function' && typeof value.on === 'function'

export function createDocumentStream(): DocumentStream {
  let reported = false
  // Without instant text the preview still refreshes through the morph, so a shape this version
  // does not know is worth one warning, not an error on every event.
  const report = (error: unknown) => {
    if (reported) {
      return
    }
    reported = true
    console.warn(
      '[@sanity/astro] Instant text is off: the Visual Editing document stream has a shape this version does not know.',
      error,
    )
  }

  const current = (): DatasetActor | undefined => {
    const candidate: unknown = actor
    if (isEmptyActor(actor)) {
      return undefined
    }
    if (!isDatasetActor(candidate)) {
      report(new TypeError('The dataset mutator actor has no getSnapshot() or on()'))
      return undefined
    }
    return candidate
  }

  return {
    readField: (documentId, path) => {
      const live = current()
      if (!live) {
        return undefined
      }
      try {
        const doc = live.getSnapshot().context.documents[documentId]?.getSnapshot().context.local
        return isObject(doc) ? studioPath.get(doc, path) : undefined
      } catch (error) {
        report(error)
        return undefined
      }
    },
    subscribe: (handlers) => {
      let subscriptions: Array<{unsubscribe(): void}> = []
      const unbind = () => {
        for (const subscription of subscriptions) {
          subscription.unsubscribe()
        }
        subscriptions = []
      }
      const bind = () => {
        unbind()
        const live = current()
        if (!live) {
          return
        }
        try {
          for (const event of EVENTS) {
            const handler = handlers[event]
            if (!handler) {
              continue
            }
            subscriptions.push(
              live.on(event, ({id}) => {
                if (typeof id === 'string') {
                  handler(id)
                } else {
                  report(new TypeError(`The ${event} event carries no document id`))
                }
              }),
            )
          }
        } catch (error) {
          unbind()
          report(error)
        }
      }
      // The overlays swap in a new actor when Presentation connects or reconnects.
      listeners.add(bind)
      bind()
      return () => {
        listeners.delete(bind)
        unbind()
      }
    },
  }
}
