// @vitest-environment jsdom
import {createEditUrl} from '@sanity/client/csm'
import {VERCEL_STEGA_REGEX, vercelStegaCombine} from '@vercel/stega'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {DocumentStream, DocumentStreamEvent, DocumentStreamHandlers} from './document-stream'
import {createLiveText, findStegaRuns} from './live-text'

/** A document stream fed by the test: flat documents keyed by id, events emitted on demand. */
function createFakeStream() {
  let documents: Record<string, Record<string, unknown>> = {}
  const subscribers = new Set<DocumentStreamHandlers>()
  const stream: DocumentStream = {
    readField: (documentId, path) => documents[documentId]?.[path],
    subscribe: (handlers) => {
      subscribers.add(handlers)
      return () => subscribers.delete(handlers)
    },
  }
  return {
    stream,
    set: (next: Record<string, Record<string, unknown>>) => {
      documents = next
    },
    emit: (event: DocumentStreamEvent, id: string) => {
      for (const handlers of subscribers) {
        handlers[event]?.(id)
      }
    },
    subscriberCount: () => subscribers.size,
  }
}

const DOC = 'drafts.movie-lab-1'

function encode(text: string, id = DOC, path = 'title') {
  return vercelStegaCombine(text, {
    origin: 'sanity.io',
    href: createEditUrl({baseUrl: '/admin', id, type: 'movie', path}),
  })
}

function mountEncoded(text: string, id = DOC, path = 'title') {
  const paragraph = document.createElement('p')
  paragraph.textContent = encode(text, id, path)
  document.body.appendChild(paragraph)
  return paragraph
}

const sourceOf = (text: string) => findStegaRuns(text)[0]?.source
const shown = (node: Node) => (node.textContent ?? '').replace(VERCEL_STEGA_REGEX, '')
const parseBody = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

/** Stands in for the morph: the live body becomes the fetched body, node for node. */
function applyRender(body: HTMLElement) {
  document.body.replaceChildren(...[...body.childNodes].map((node) => document.adoptNode(node)))
}

afterEach(() => {
  document.body.replaceChildren()
})

/** Mirrors the dataset mutator: the first snapshot arrives through `sync` before any mutation. */
function setup() {
  const fake = createFakeStream()
  const onRemoteChange = vi.fn()
  const live = createLiveText({stream: fake.stream, onRemoteChange})
  const load = (id: string, doc: Record<string, unknown>) => {
    fake.set({[id]: doc})
    fake.emit('sync', id)
  }
  const mutate = (id: string, doc: Record<string, unknown>) => {
    fake.set({[id]: doc})
    fake.emit('mutation', id)
  }
  return {fake, live, onRemoteChange, load, mutate}
}

describe('findStegaRuns', () => {
  it('maps published, draft and version perspectives onto document ids', () => {
    expect(sourceOf(encode('Arrival', 'movie-lab-1'))).toEqual({
      documentId: 'movie-lab-1',
      path: 'title',
    })
    expect(sourceOf(encode('Arrival', 'drafts.movie-lab-1'))).toEqual({
      documentId: 'drafts.movie-lab-1',
      path: 'title',
    })
    expect(sourceOf(encode('Arrival', 'versions.rx.movie-lab-1'))).toEqual({
      documentId: 'versions.rx.movie-lab-1',
      path: 'title',
    })
  })

  it('finds nothing in plain text, the wrong origin, a broken href, or junk', () => {
    expect(sourceOf('Arrival')).toBeUndefined()
    // Four or more zero-width characters that are not a payload; the decoder throws on these.
    expect(sourceOf('Arrival\u200b\u200b\u200b\u200b\u200c')).toBeUndefined()
    expect(
      sourceOf(vercelStegaCombine('Arrival', {origin: 'other.io', href: '/admin?id=x&path=title'})),
    ).toBeUndefined()
    expect(
      sourceOf(vercelStegaCombine('Arrival', {origin: 'sanity.io', href: '/admin?path=title'})),
    ).toBeUndefined()
    expect(
      sourceOf(vercelStegaCombine('Arrival', {origin: 'sanity.io', href: 'http://['})),
    ).toBeUndefined()
  })
})

describe('createLiveText', () => {
  it('rewrites matching text on mutation and rebased.remote, keeping the stega suffix', () => {
    const node = mountEncoded('Arrival')
    const {fake, live, onRemoteChange, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})

    mutate(DOC, {title: 'Sicario'})

    expect(shown(node)).toBe('Sicario')
    expect(sourceOf(node.textContent ?? '')).toEqual({documentId: DOC, path: 'title'})
    expect(onRemoteChange).toHaveBeenCalledWith(DOC)

    onRemoteChange.mockClear()
    fake.set({[DOC]: {title: 'Prisoners'}})
    fake.emit('rebased.remote', DOC)
    expect(shown(node)).toBe('Prisoners')
    expect(onRemoteChange).toHaveBeenCalledWith(DOC)

    live.dispose()
  })

  it('treats the first snapshot as the baseline: no rewrite, no reconcile request', () => {
    const node = mountEncoded('Arrival')
    const {fake, live, onRemoteChange} = setup()

    fake.set({[DOC]: {title: 'Arrival'}})
    fake.emit('sync', DOC)
    fake.emit('rebased.remote', DOC)

    expect(shown(node)).toBe('Arrival')
    expect(onRemoteChange).not.toHaveBeenCalled()

    live.dispose()
  })

  it('leaves text alone when it was never a raw value the document held', () => {
    const node = mountEncoded('ARRIVAL')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})

    mutate(DOC, {title: 'Sicario'})

    expect(shown(node)).toBe('ARRIVAL')

    live.dispose()
  })

  it('patches a value the template surrounded with whitespace', () => {
    const heading = document.createElement('h2')
    heading.append(document.createTextNode(`\n  ${encode('Arrival')}\n`))
    document.body.appendChild(heading)
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})

    mutate(DOC, {title: 'Sicario'})

    expect(shown(heading)).toBe('\n  Sicario\n')
    expect(sourceOf(heading.textContent ?? '')).toEqual({documentId: DOC, path: 'title'})

    live.dispose()
  })

  it('replaces the whole rendered value when an older value is also a suffix of it', () => {
    const node = mountEncoded('rival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'rival'})

    mutate(DOC, {title: 'Arrival'})
    expect(shown(node)).toBe('Arrival')

    mutate(DOC, {title: 'Sicario'})
    expect(shown(node)).toBe('Sicario')

    live.dispose()
  })

  it('patches when the new value is a suffix of the value on screen', () => {
    const node = mountEncoded('foobar')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'foobar'})

    mutate(DOC, {title: 'bar'})

    expect(shown(node)).toBe('bar')

    live.dispose()
  })

  it('replaces rather than inserts after the field has been empty', () => {
    const node = mountEncoded('')
    const {live, load, mutate} = setup()
    load(DOC, {title: ''})

    mutate(DOC, {title: 'D'})
    mutate(DOC, {title: 'Du'})
    mutate(DOC, {title: 'Dune'})

    expect(shown(node)).toBe('Dune')

    live.dispose()
  })

  it('never rewrites a transformed rendering, even when it equals an earlier raw value', () => {
    const node = mountEncoded('HELLO')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Hello'})

    mutate(DOC, {title: 'HELLO'})
    mutate(DOC, {title: 'Hello world'})

    expect(shown(node)).toBe('HELLO')

    live.dispose()
  })

  it('settles a field as transformed when two renders of one value both show something else', () => {
    mountEncoded('Hello')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'hello'})
    // The morph after an unrelated change renders the same value the same way.
    expect(live.patchAll()).toBe(0)

    // A later value the transform leaves untouched must not calibrate the field as verbatim.
    mutate(DOC, {title: 'Hello w'})
    applyRender(parseBody(`<p>${encode('Hello w')}</p>`))
    live.patchAll()
    mutate(DOC, {title: 'hello wo'})

    expect(shown(document.body)).toBe('Hello w')

    live.dispose()
  })

  it('repairs a morph rollback after a long typing burst', () => {
    const node = mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})
    for (let i = 1; i <= 40; i++) {
      mutate(DOC, {title: `Arrival ${'x'.repeat(i)}`})
    }
    expect(shown(node)).toBe(`Arrival ${'x'.repeat(40)}`)

    node.textContent = encode('Arrival')

    expect(live.patchAll()).toBe(1)
    expect(shown(node)).toBe(`Arrival ${'x'.repeat(40)}`)

    live.dispose()
  })

  it('patches each field in a text node that carries several stega payloads', () => {
    const node = document.createElement('p')
    node.append(document.createTextNode(`${encode('Arrival')} (${encode('2016', DOC, 'year')})`))
    document.body.appendChild(node)
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival', year: '2016'})

    mutate(DOC, {title: 'Sicario', year: '2015'})

    expect(shown(node)).toBe('Sicario (2015)')

    live.dispose()
  })

  it('patches a verbatim rendering even when the same field is also rendered transformed', () => {
    const raw = mountEncoded('Arrival')
    const shouted = document.createElement('p')
    shouted.append(document.createTextNode(`ARRIVAL${encode('Arrival').slice(7)}`))
    document.body.insertBefore(shouted, raw)
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})

    mutate(DOC, {title: 'Sicario'})

    expect(shown(raw)).toBe('Sicario')
    expect(shown(shouted)).toBe('ARRIVAL')

    live.dispose()
  })

  it('only patches fields the page has been seen rendering verbatim', () => {
    const verbatim = mountEncoded('Arrival')
    const shouted = mountEncoded('ARRIVAL', DOC, 'tagline')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival', tagline: 'Arrival'})

    mutate(DOC, {title: 'Sicario', tagline: 'Sicario'})

    expect(shown(verbatim)).toBe('Sicario')
    expect(shown(shouted)).toBe('ARRIVAL')

    live.dispose()
  })

  it('patches on rebased.local without calling onRemoteChange', () => {
    const node = mountEncoded('Arrival')
    const {fake, live, onRemoteChange, load} = setup()
    load(DOC, {title: 'Arrival'})

    fake.set({[DOC]: {title: 'Dune'}})
    fake.emit('rebased.local', DOC)

    expect(shown(node)).toBe('Dune')
    expect(onRemoteChange).not.toHaveBeenCalled()

    live.dispose()
  })

  it('patchAll repairs text a morph rolled back to an earlier value', () => {
    const node = mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})
    mutate(DOC, {title: 'Sicario'})
    expect(shown(node)).toBe('Sicario')

    node.textContent = encode('Arrival')

    expect(live.patchAll()).toBe(1)
    expect(shown(node)).toBe('Sicario')

    live.dispose()
  })

  it('isStale flags fetched HTML that still shows a superseded value', () => {
    mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})
    mutate(DOC, {title: 'Sicario'})

    const render = (title: string) => parseBody(`<h2>\n  ${encode(title)}\n</h2>`)

    expect(live.isStale(render('Arrival'))).toBe(true)
    expect(live.isStale(render('Sicario'))).toBe(false)
    expect(live.isStale(render('Arrival: Director’s Cut'))).toBe(false)

    live.dispose()
  })

  it('calibrates a field first rendered by a stale morph once the page catches up', () => {
    // The page renders a tagline only once it has one, so the live DOM has no node for it.
    mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival', tagline: ''})
    mutate(DOC, {title: 'Arrival', tagline: 'Now'})

    // The server is one keystroke behind the stream. The check cannot know a field it has
    // never seen, and asking must not calibrate it from HTML that is about to be discarded.
    const stale = parseBody(`<p>${encode('Arrival')}</p><p>${encode('No', DOC, 'tagline')}</p>`)
    expect(live.isStale(stale)).toBe(false)
    applyRender(stale)
    live.patchAll()
    expect(shown(document.body)).toBe('ArrivalNo')

    // The settle pass brings the current render, which proves the page shows the raw value.
    applyRender(parseBody(`<p>${encode('Arrival')}</p><p>${encode('Now', DOC, 'tagline')}</p>`))
    live.patchAll()

    mutate(DOC, {title: 'Arrival', tagline: 'Now showing'})

    expect(shown(document.body)).toBe('ArrivalNow showing')
    live.dispose()
  })

  it('keeps calibrating from the next render when the editor types through a stale one', () => {
    mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival', tagline: ''})
    mutate(DOC, {title: 'Arrival', tagline: 'Ne'})

    applyRender(parseBody(`<p>${encode('Arrival')}</p><p>${encode('N', DOC, 'tagline')}</p>`))
    live.patchAll()
    mutate(DOC, {title: 'Arrival', tagline: 'New'})
    applyRender(parseBody(`<p>${encode('Arrival')}</p><p>${encode('New', DOC, 'tagline')}</p>`))
    live.patchAll()

    mutate(DOC, {title: 'Arrival', tagline: 'New!'})

    expect(shown(document.body)).toBe('ArrivalNew!')
    live.dispose()
  })

  it('returns 0 when the field is unchanged or the node is gone', () => {
    const node = mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})

    expect(live.patchAll()).toBe(0)

    node.remove()
    mutate(DOC, {title: 'Sicario'})
    expect(live.patchAll()).toBe(0)

    live.dispose()
  })

  it('skips a non-string field and a document the stream does not hold', () => {
    const node = mountEncoded('Arrival')
    const {live, load, mutate} = setup()

    expect(live.patchAll()).toBe(0)
    load(DOC, {title: 'Arrival'})
    mutate(DOC, {title: 12})

    expect(shown(node)).toBe('Arrival')
    expect(live.patchAll()).toBe(0)

    live.dispose()
  })

  it('forgets fields whose documents left the page', () => {
    const node = mountEncoded('Arrival')
    const {live, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})
    node.remove()
    live.patchAll()

    // Back on the page with a transformed rendering, the field calibrates afresh instead of
    // inheriting the verbatim verdict and the value history from its earlier life.
    mountEncoded('ARRIVAL')
    live.patchAll()
    mutate(DOC, {title: 'ARRIVAL'})
    mutate(DOC, {title: 'Arrival'})

    expect(shown(document.body)).toBe('ARRIVAL')
    live.dispose()
  })

  it('unsubscribes and stops patching after dispose', () => {
    const node = mountEncoded('Arrival')
    const {fake, live, onRemoteChange, load, mutate} = setup()
    load(DOC, {title: 'Arrival'})
    expect(fake.subscriberCount()).toBe(1)

    live.dispose()
    expect(fake.subscriberCount()).toBe(0)
    mutate(DOC, {title: 'Sicario'})

    expect(shown(node)).toBe('Arrival')
    expect(onRemoteChange).not.toHaveBeenCalled()
    expect(live.patchAll()).toBe(0)
  })
})
