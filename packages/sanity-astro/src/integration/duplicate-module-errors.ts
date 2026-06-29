export function collectDuplicateModuleErrors(consoleErrors: string[]) {
  return consoleErrors.filter(
    (message) =>
      message.includes('Invalid hook call') ||
      message.includes("several instances of 'styled-components'") ||
      message.includes("reading 'v2'") ||
      message.includes('Duplicate instances of context'),
  )
}
