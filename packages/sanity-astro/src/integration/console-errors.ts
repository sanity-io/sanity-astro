import type {ConsoleMessage, Page} from 'playwright'

/** Collects `console.error` output and uncaught page errors for the lifetime of the page. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  return errors
}
