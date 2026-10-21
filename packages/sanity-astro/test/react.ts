import {act, type ReactElement} from 'react'
import {createRoot, type Root} from 'react-dom/client'

const roots: Array<{root: Root; container: HTMLElement}> = []

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

export async function renderInAct(element: ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
  })
  roots.push({root, container})
}

export async function unmountAll(): Promise<void> {
  for (const {root, container} of roots.splice(0)) {
    await act(async () => root.unmount())
    container.remove()
  }
}

/** Clicks a synthetic anchor and reports whether a listener claimed the click. */
export function clickAnchor(href: string, init: MouseEventInit = {}): boolean {
  const anchor = document.createElement('a')
  anchor.href = href
  document.body.appendChild(anchor)
  let claimed = false
  anchor.addEventListener('click', (event) => {
    claimed = event.defaultPrevented
    event.preventDefault()
  })
  anchor.dispatchEvent(
    new MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ...init}),
  )
  anchor.remove()
  return claimed
}
