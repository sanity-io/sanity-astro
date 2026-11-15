import {afterEach, describe, expect, it, vi} from 'vitest'

import {createDocumentStream, variantId} from './document-stream'

const {upstream} = vi.hoisted(() => {
  type Handler = (event: {id?: unknown}) => void
  const handlers = new Map<string, Set<Handler>>()
  let documents: Record<string, unknown> = {}
  const datasetActor = {
    on(event: string, handler: Handler) {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
      return {unsubscribe: () => set.delete(handler)}
    },
    getSnapshot() {
      return {
        context: {
          documents: Object.fromEntries(
            Object.entries(documents).map(([id, local]) => [
              id,
              {getSnapshot: () => ({context: {local}})},
            ]),
          ),
        },
      }
    },
  }
  const emptyActor = {empty: true}
  const state = {actor: datasetActor as unknown, listeners: new Set<() => void>()}
  return {
    upstream: {
      state,
      emptyActor,
      datasetActor,
      emit: (event: string, payload: {id?: unknown}) =>
        handlers.get(event)?.forEach((handler) => handler(payload)),
      handlerCount: () => [...handlers.values()].reduce((count, set) => count + set.size, 0),
      setDocuments: (next: Record<string, unknown>) => {
        documents = next
      },
      reset: () => {
        handlers.clear()
        documents = {}
        state.actor = datasetActor
        state.listeners.clear()
      },
    },
  }
})

vi.mock('@sanity/visual-editing/optimistic', () => ({
  get actor() {
    return upstream.state.actor
  },
  listeners: upstream.state.listeners,
  isEmptyActor: (value: unknown) => value === upstream.emptyActor,
}))

afterEach(() => {
  upstream.reset()
  vi.restoreAllMocks()
})

describe('variantId', () => {
  it('maps the stega perspective onto the id the stream uses', () => {
    expect(variantId('movie-1', 'published')).toBe('movie-1')
    expect(variantId('movie-1', null)).toBe('drafts.movie-1')
    expect(variantId('movie-1', 'drafts')).toBe('drafts.movie-1')
    expect(variantId('movie-1', 'rSpring')).toBe('versions.rSpring.movie-1')
  })
})

describe('createDocumentStream', () => {
  it('reads a field of the local snapshot by studio path', () => {
    upstream.setDocuments({
      'drafts.movie-1': {title: 'Arrival', sections: [{_key: 'a', title: 'Cast'}]},
    })
    const stream = createDocumentStream()

    expect(stream.readField('drafts.movie-1', 'title')).toBe('Arrival')
    expect(stream.readField('drafts.movie-1', 'sections[_key=="a"].title')).toBe('Cast')
    expect(stream.readField('drafts.movie-1', 'missing')).toBeUndefined()
    expect(stream.readField('movie-2', 'title')).toBeUndefined()
  })

  it('delivers the four events with their document id and stops after unsubscribe', () => {
    const stream = createDocumentStream()
    const sync = vi.fn()
    const mutation = vi.fn()
    const rebasedRemote = vi.fn()
    const rebasedLocal = vi.fn()

    const unsubscribe = stream.subscribe({
      sync,
      mutation,
      'rebased.remote': rebasedRemote,
      'rebased.local': rebasedLocal,
    })
    upstream.emit('sync', {id: 'a'})
    upstream.emit('mutation', {id: 'b'})
    upstream.emit('rebased.remote', {id: 'c'})
    upstream.emit('rebased.local', {id: 'd'})

    expect(sync).toHaveBeenCalledWith('a')
    expect(mutation).toHaveBeenCalledWith('b')
    expect(rebasedRemote).toHaveBeenCalledWith('c')
    expect(rebasedLocal).toHaveBeenCalledWith('d')
    expect(upstream.state.listeners.size).toBe(1)

    unsubscribe()
    upstream.emit('mutation', {id: 'e'})

    expect(mutation).toHaveBeenCalledTimes(1)
    expect(upstream.handlerCount()).toBe(0)
    expect(upstream.state.listeners.size).toBe(0)
  })

  it('only binds the events that have a handler', () => {
    const stream = createDocumentStream()

    stream.subscribe({mutation: vi.fn()})

    expect(upstream.handlerCount()).toBe(1)
  })

  it('waits for the overlays to install an actor, then follows every replacement', () => {
    upstream.state.actor = upstream.emptyActor
    const stream = createDocumentStream()
    const mutation = vi.fn()

    stream.subscribe({mutation})
    expect(upstream.handlerCount()).toBe(0)
    expect(stream.readField('drafts.movie-1', 'title')).toBeUndefined()

    upstream.state.actor = upstream.datasetActor
    upstream.state.listeners.forEach((listener) => listener())
    upstream.emit('mutation', {id: 'a'})
    expect(mutation).toHaveBeenCalledWith('a')

    // A reconnect installs a fresh actor; the old subscriptions must not pile up.
    upstream.state.listeners.forEach((listener) => listener())
    expect(upstream.handlerCount()).toBe(1)
  })

  it('warns once and reads nothing when the actor has a shape it does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    upstream.state.actor = {getSnapshot: () => ({context: {}})}
    const stream = createDocumentStream()
    const mutation = vi.fn()

    stream.subscribe({mutation})
    expect(stream.readField('drafts.movie-1', 'title')).toBeUndefined()
    expect(stream.readField('drafts.movie-1', 'title')).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/Instant text is off/)
  })

  it('warns once when a snapshot throws or an event carries no id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stream = createDocumentStream()
    const mutation = vi.fn()
    stream.subscribe({mutation})
    const getSnapshot = vi.spyOn(upstream.datasetActor, 'getSnapshot').mockImplementation(() => {
      throw new TypeError('context moved')
    })

    expect(stream.readField('drafts.movie-1', 'title')).toBeUndefined()
    upstream.emit('mutation', {})
    upstream.emit('mutation', {id: 'a'})

    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mutation).toHaveBeenCalledWith('a')
    expect(warn).toHaveBeenCalledTimes(1)
    getSnapshot.mockRestore()
  })
})
