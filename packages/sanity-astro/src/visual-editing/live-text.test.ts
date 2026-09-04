// @vitest-environment jsdom
import {createEditUrl} from '@sanity/client/csm'
import {vercelStegaCombine} from '@vercel/stega'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createLiveText, decodeTextSource} from './live-text'

const {fakeActor, listeners, setDocuments, setEmpty, isEmpty} = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: {id: string}) => void>>()
  let documents: Record<string, unknown> = {}
  let empty = false
  const listenerSet = new Set<() => void>()

  const actorStub = {
    on(event: string, handler: (event: {id: string}) => void) {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
      return {
        unsubscribe() {
          set!.delete(handler)
        },
      }
    },
    getSnapshot() {
      return {
        context: {
          documents: Object.fromEntries(
            Object.entries(documents).map(([id, doc]) => [
              id,
              {getSnapshot: () => ({context: {local: doc}})},
            ]),
          ),
        },
      }
    },
    emit(event: string, id: string) {
      handlers.get(event)?.forEach((handler) => handler({id}))
    },
    reset() {
      handlers.clear()
    },
  }

  return {
    fakeActor: actorStub,
    listeners: listenerSet,
    setDocuments(next: Record<string, unknown>) {
      documents = next
    },
    setEmpty(next: boolean) {
      empty = next
    },
    isEmpty() {
      return empty
    },
  }
})

vi.mock('@sanity/visual-editing/optimistic', () => ({
  actor: fakeActor,
  listeners,
  isEmptyActor: (value: unknown) => value !== fakeActor || isEmpty(),
}))

function encode(text: string, id: string, path = 'title') {
  return vercelStegaCombine(text, {
    origin: 'sanity.io',
    href: createEditUrl({baseUrl: '/admin', id, type: 'movie', path}),
  })
}

function mountEncoded(text: string, id: string, path = 'title') {
  const paragraph = document.createElement('p')
  paragraph.textContent = encode(text, id, path)
  document.body.appendChild(paragraph)
  return paragraph
}

afterEach(() => {
  document.body.replaceChildren()
  setDocuments({})
  setEmpty(false)
  fakeActor.reset()
  listeners.clear()
})

describe('decodeTextSource', () => {
  it('maps published, draft and version perspectives onto document ids', () => {
    expect(decodeTextSource(encode('Arrival', 'movie-lab-1'))).toEqual(
      expect.objectContaining({documentId: 'movie-lab-1', path: 'title'}),
    )
    expect(decodeTextSource(encode('Arrival', 'drafts.movie-lab-1'))).toEqual(
      expect.objectContaining({documentId: 'drafts.movie-lab-1', path: 'title'}),
    )
    expect(decodeTextSource(encode('Arrival', 'versions.rx.movie-lab-1'))).toEqual(
      expect.objectContaining({documentId: 'versions.rx.movie-lab-1', path: 'title'}),
    )
  })

  it('returns undefined for missing stega, the wrong origin, or a broken href', () => {
    expect(decodeTextSource('Arrival')).toBeUndefined()
    expect(
      decodeTextSource(
        vercelStegaCombine('Arrival', {origin: 'other.io', href: '/admin?id=x&path=title'}),
      ),
    ).toBeUndefined()
    expect(
      decodeTextSource(
        vercelStegaCombine('Arrival', {origin: 'sanity.io', href: '/admin?path=title'}),
      ),
    ).toBeUndefined()
    expect(
      decodeTextSource(vercelStegaCombine('Arrival', {origin: 'sanity.io', href: 'http://['})),
    ).toBeUndefined()
  })
})

/** Mirrors the dataset mutator: the first snapshot arrives through `sync` before any mutation. */
function loadDocument(id: string, doc: Record<string, unknown>) {
  setDocuments({[id]: doc})
  fakeActor.emit('sync', id)
}

function mutateDocument(id: string, doc: Record<string, unknown>) {
  setDocuments({[id]: doc})
  fakeActor.emit('mutation', id)
}

describe('createLiveText', () => {
  it('rewrites matching text on mutation and rebased.remote, keeping the stega suffix', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const onRemoteChange = vi.fn()
    const live = createLiveText({onRemoteChange})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})

    mutateDocument('drafts.movie-lab-1', {title: 'Sicario'})

    expect(node.textContent?.startsWith('Sicario')).toBe(true)
    expect(decodeTextSource(node.textContent ?? '')).toEqual(
      expect.objectContaining({documentId: 'drafts.movie-lab-1', path: 'title'}),
    )
    expect(onRemoteChange).toHaveBeenCalledWith('drafts.movie-lab-1', {title: 'Sicario'})

    onRemoteChange.mockClear()
    setDocuments({'drafts.movie-lab-1': {title: 'Prisoners'}})
    fakeActor.emit('rebased.remote', 'drafts.movie-lab-1')
    expect(node.textContent?.startsWith('Prisoners')).toBe(true)
    expect(onRemoteChange).toHaveBeenCalledWith('drafts.movie-lab-1', {title: 'Prisoners'})

    live.dispose()
  })

  it('treats the first snapshot as the baseline: no rewrite, no reconcile request', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const onRemoteChange = vi.fn()
    const live = createLiveText({onRemoteChange})

    setDocuments({'drafts.movie-lab-1': {title: 'Arrival'}})
    fakeActor.emit('sync', 'drafts.movie-lab-1')
    fakeActor.emit('rebased.remote', 'drafts.movie-lab-1')

    expect(node.textContent?.startsWith('Arrival')).toBe(true)
    expect(onRemoteChange).not.toHaveBeenCalled()

    live.dispose()
  })

  it('leaves text alone when it was never a raw value the document held', () => {
    const node = mountEncoded('ARRIVAL', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})

    mutateDocument('drafts.movie-lab-1', {title: 'Sicario'})

    expect(node.textContent?.startsWith('ARRIVAL')).toBe(true)

    live.dispose()
  })

  it('never rewrites a transformed rendering, even when it equals an earlier raw value', () => {
    const node = mountEncoded('HELLO', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Hello'})

    mutateDocument('drafts.movie-lab-1', {title: 'HELLO'})
    mutateDocument('drafts.movie-lab-1', {title: 'Hello world'})

    expect(node.textContent?.startsWith('HELLO')).toBe(true)

    live.dispose()
  })

  it('repairs a morph rollback after a long typing burst', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})
    for (let i = 1; i <= 40; i++) {
      mutateDocument('drafts.movie-lab-1', {title: `Arrival ${'x'.repeat(i)}`})
    }
    expect(node.textContent?.startsWith(`Arrival ${'x'.repeat(40)}`)).toBe(true)

    node.textContent = encode('Arrival', 'drafts.movie-lab-1')

    expect(live.patchAll()).toBe(1)
    expect(node.textContent?.startsWith(`Arrival ${'x'.repeat(40)}`)).toBe(true)

    live.dispose()
  })

  it('only patches fields the page has been seen rendering verbatim', () => {
    const verbatim = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const shouted = mountEncoded('ARRIVAL', 'drafts.movie-lab-1', 'tagline')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival', tagline: 'Arrival'})

    mutateDocument('drafts.movie-lab-1', {title: 'Sicario', tagline: 'Sicario'})

    expect(verbatim.textContent?.startsWith('Sicario')).toBe(true)
    expect(shouted.textContent?.startsWith('ARRIVAL')).toBe(true)

    live.dispose()
  })

  it('patches on rebased.local without calling onRemoteChange', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const onRemoteChange = vi.fn()
    const live = createLiveText({onRemoteChange})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})

    setDocuments({'drafts.movie-lab-1': {title: 'Dune'}})
    fakeActor.emit('rebased.local', 'drafts.movie-lab-1')

    expect(node.textContent?.startsWith('Dune')).toBe(true)
    expect(onRemoteChange).not.toHaveBeenCalled()

    live.dispose()
  })

  it('patchAll repairs text a morph rolled back to an earlier value', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})
    mutateDocument('drafts.movie-lab-1', {title: 'Sicario'})
    expect(node.textContent?.startsWith('Sicario')).toBe(true)

    node.textContent = encode('Arrival', 'drafts.movie-lab-1')

    expect(live.patchAll()).toBe(1)
    expect(node.textContent?.startsWith('Sicario')).toBe(true)

    live.dispose()
  })

  it('isStale flags fetched HTML that still shows a superseded value', () => {
    mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})
    mutateDocument('drafts.movie-lab-1', {title: 'Sicario'})

    const parse = (title: string) =>
      new DOMParser().parseFromString(
        `<body><p>${encode(title, 'drafts.movie-lab-1')}</p></body>`,
        'text/html',
      ).body

    expect(live.isStale(parse('Arrival'))).toBe(true)
    expect(live.isStale(parse('Sicario'))).toBe(false)
    expect(live.isStale(parse('Arrival: Director’s Cut'))).toBe(false)

    live.dispose()
  })

  it('returns 0 when the field is unchanged or the node is gone', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})

    expect(live.patch('drafts.movie-lab-1')).toBe(0)

    node.remove()
    setDocuments({'drafts.movie-lab-1': {title: 'Sicario'}})
    fakeActor.emit('mutation', 'drafts.movie-lab-1')
    expect(live.patch('drafts.movie-lab-1')).toBe(0)

    live.dispose()
  })

  it('skips a non-string field and a missing document', () => {
    mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})

    expect(live.patch('drafts.movie-lab-1')).toBe(0)
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})
    mutateDocument('drafts.movie-lab-1', {title: 12})
    expect(live.patch('drafts.movie-lab-1')).toBe(0)

    live.dispose()
  })

  it('does not read a document when the actor is empty', () => {
    setEmpty(true)
    mountEncoded('Arrival', 'drafts.movie-lab-1')
    const live = createLiveText({onRemoteChange: vi.fn()})

    setDocuments({'drafts.movie-lab-1': {title: 'Sicario'}})
    expect(live.patch('drafts.movie-lab-1')).toBe(0)
    expect(live.patchAll()).toBe(0)

    live.dispose()
  })

  it('unsubscribes and stops patching after dispose', () => {
    const node = mountEncoded('Arrival', 'drafts.movie-lab-1')
    const onRemoteChange = vi.fn()
    const live = createLiveText({onRemoteChange})
    loadDocument('drafts.movie-lab-1', {title: 'Arrival'})
    expect(listeners.size).toBe(1)
    live.dispose()
    expect(listeners.size).toBe(0)

    mutateDocument('drafts.movie-lab-1', {title: 'Sicario'})

    expect(node.textContent?.startsWith('Arrival')).toBe(true)
    expect(onRemoteChange).not.toHaveBeenCalled()
  })
})
