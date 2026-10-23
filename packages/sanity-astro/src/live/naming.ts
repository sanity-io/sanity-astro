const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value)
}

function segments(name: string): string[] {
  return name.split(/[^A-Za-z0-9]+/).filter((segment) => segment !== '')
}

function capitalize(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function camelCase(name: string): string {
  return segments(name)
    .map((segment, index) =>
      index === 0 ? segment.charAt(0).toLowerCase() + segment.slice(1) : capitalize(segment),
    )
    .join('')
}

export function pascalCase(name: string): string {
  return segments(name).map(capitalize).join('')
}
