const STORAGE_KEY = 'sanity-astro:scroll'

type SavedScroll = {href: string; x: number; y: number}

function readSaved(storage: Storage): SavedScroll | undefined {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) {
    return undefined
  }
  storage.removeItem(STORAGE_KEY)
  try {
    const parsed = JSON.parse(raw) as Partial<SavedScroll>
    if (
      typeof parsed.href === 'string' &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number'
    ) {
      return {href: parsed.href, x: parsed.x, y: parsed.y}
    }
  } catch {
    // A corrupt entry is dropped by the removeItem above.
  }
  return undefined
}

/**
 * Reloads the page and remembers where the reader was, so `restoreScroll` can put them back
 * once the new document has laid out.
 */
export function reloadPreservingScroll(win: Window = window): void {
  try {
    win.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        href: win.location.href,
        x: win.scrollX,
        y: win.scrollY,
      } satisfies SavedScroll),
    )
  } catch {
    // Storage can be unavailable (privacy mode, quota). The reload still happens.
  }
  win.location.reload()
}

/**
 * Restores the position saved by `reloadPreservingScroll` when the reload landed on the same
 * URL. Runs after layout so the target offset exists.
 */
export function restoreScroll(win: Window = window): boolean {
  let saved: SavedScroll | undefined
  try {
    saved = readSaved(win.sessionStorage)
  } catch {
    return false
  }
  if (!saved || saved.href !== win.location.href) {
    return false
  }
  win.requestAnimationFrame(() => {
    win.scrollTo(saved.x, saved.y)
  })
  return true
}
