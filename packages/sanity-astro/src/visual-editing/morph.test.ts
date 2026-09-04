// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createMorph, fetchDocument, morphDocument, RefreshFetchError} from './morph'

function htmlDocument(html: string) {
  return new DOMParser().parseFromString(html, 'text/html')
}

function htmlResponse(
  body: string,
  init: {status?: number; contentType?: string | null; redirected?: boolean; url?: string} = {},
) {
  const headers = new Headers()
  if (init.contentType !== null) {
    headers.set('content-type', init.contentType ?? 'text/html')
  }
  const response = new Response(body, {status: init.status ?? 200, headers})
  if (init.redirected) {
    Object.defineProperty(response, 'redirected', {value: true})
  }
  if (init.url) {
    Object.defineProperty(response, 'url', {value: init.url})
  }
  return response
}

afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelectorAll('[data-vite-dev-id]').forEach((node) => node.remove())
  document.documentElement.removeAttribute('class')
  document.documentElement
    .querySelectorAll('sanity-visual-editing, astro-dev-toolbar, vite-error-overlay')
    .forEach((node) => node.remove())
})

describe('morphDocument', () => {
  it('keeps text node identity when only the value changes', () => {
    document.body.innerHTML = '<p>before</p>'
    const node = document.querySelector('p')!.firstChild as Text

    morphDocument(document, htmlDocument('<html><body><p>after</p></body></html>'))

    expect(node.nodeValue).toBe('after')
    expect(document.contains(node)).toBe(true)
  })

  it('keeps a sanity-visual-editing host that lives under html', () => {
    const overlay = document.createElement('sanity-visual-editing')
    document.documentElement.appendChild(overlay)

    morphDocument(document, htmlDocument('<html><body><p>next</p></body></html>'))

    expect(document.contains(overlay)).toBe(true)
    expect(document.querySelector('p')?.textContent).toBe('next')
  })

  it('keeps a vite style in head while the title changes', () => {
    document.title = 'old title'
    const style = document.createElement('style')
    style.setAttribute('data-vite-dev-id', '/src/page.css')
    document.head.appendChild(style)

    morphDocument(
      document,
      htmlDocument('<html><head><title>new title</title></head><body></body></html>'),
    )

    expect(document.title).toBe('new title')
    expect(document.head.querySelector('style[data-vite-dev-id="/src/page.css"]')).toBe(style)
  })

  it('leaves an astro-island child subtree untouched', () => {
    document.body.innerHTML = '<astro-island><span id="island-child">client</span></astro-island>'
    const child = document.getElementById('island-child')!

    morphDocument(
      document,
      htmlDocument(
        '<html><body><astro-island><span id="island-child">server</span></astro-island></body></html>',
      ),
    )

    expect(child.textContent).toBe('client')
    expect(document.contains(child)).toBe(true)
  })

  it('keeps the class on html when the next document differs', () => {
    document.documentElement.className = 'dark'

    morphDocument(document, htmlDocument('<html class="light"><body><p>x</p></body></html>'))

    expect(document.documentElement.className).toBe('dark')
  })

  it('keeps a client-injected element marked with transition:persist', () => {
    document.body.innerHTML = '<p>content</p>'
    const widget = document.createElement('div')
    widget.setAttribute('data-astro-transition-persist', 'chat')
    widget.textContent = 'chat widget'
    document.body.appendChild(widget)
    const banner = document.createElement('div')
    banner.textContent = 'plain client element'
    document.body.appendChild(banner)

    morphDocument(document, htmlDocument('<html><body><p>content</p></body></html>'))

    expect(document.contains(widget)).toBe(true)
    expect(document.contains(banner)).toBe(false)
  })
})

describe('fetchDocument', () => {
  it('rejects a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse('nope', {status: 500}))

    await expect(fetchDocument('http://localhost/page', fetchImpl)).rejects.toBeInstanceOf(
      RefreshFetchError,
    )
  })

  it('rejects a non-html content type', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(htmlResponse('{}', {contentType: 'application/json'}))

    await expect(fetchDocument('http://localhost/page', fetchImpl)).rejects.toBeInstanceOf(
      RefreshFetchError,
    )
  })

  it('rejects a redirect to another URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse('<html></html>', {
        redirected: true,
        url: 'http://localhost/elsewhere',
      }),
    )

    await expect(fetchDocument('http://localhost/page', fetchImpl)).rejects.toBeInstanceOf(
      RefreshFetchError,
    )
  })

  it('rejects when the content type is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse('<html></html>', {contentType: null}))

    await expect(fetchDocument('http://localhost/page', fetchImpl)).rejects.toBeInstanceOf(
      RefreshFetchError,
    )
  })

  it('accepts a same-URL redirect that only changes the hash', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse('<html><body><p>same</p></body></html>', {
        redirected: true,
        url: 'http://localhost/page#top',
      }),
    )

    const next = await fetchDocument('http://localhost/page', fetchImpl)
    expect(next.querySelector('p')?.textContent).toBe('same')
  })

  it('resolves a Document for a 200 text/html response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>ok</p></body></html>'))

    const next = await fetchDocument('http://localhost/page', fetchImpl)

    expect(next).toBeInstanceOf(Document)
    expect(next.querySelector('p')?.textContent).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost/page', {
      headers: {accept: 'text/html'},
      cache: 'no-store',
      credentials: 'same-origin',
    })
  })
})

describe('createMorph', () => {
  it('fetches the current location and morphs document', async () => {
    document.body.innerHTML = '<p id="marker">before</p>'
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(htmlResponse('<html><body><p id="marker">after</p></body></html>'))

    await createMorph(fetchImpl)()

    expect(fetchImpl).toHaveBeenCalledWith(window.location.href, expect.any(Object))
    expect(document.getElementById('marker')?.textContent).toBe('after')
  })
})
