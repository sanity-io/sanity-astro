import type {HistoryUpdate} from '@sanity/visual-editing/react'

export function getPresentationUrl(location: {
  pathname: string
  search: string
  hash: string
}): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function shouldPublishUrl(nextUrl: string, previousUrl: string): boolean {
  return nextUrl !== previousUrl
}

export function applyPresentationHistoryUpdate(
  update: Pick<HistoryUpdate, 'type' | 'url'>,
  currentHref: string,
  navigate: {
    assign: (url: string) => void
    replace: (url: string) => void
    back: () => void
  },
): void {
  switch (update.type) {
    case 'push': {
      if (currentHref !== update.url) {
        navigate.assign(update.url)
      }
      return
    }
    case 'replace': {
      if (currentHref !== update.url) {
        navigate.replace(update.url)
      }
      return
    }
    case 'pop': {
      navigate.back()
      return
    }
    default: {
      throw new Error(
        `Unknown history update type: ${(update as {type?: string}).type ?? 'unknown'}`,
      )
    }
  }
}
