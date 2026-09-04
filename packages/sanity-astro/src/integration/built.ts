import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function assertSanityAstroIsBuilt(): void {
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    exports: {'.': {default: string}}
  }
  const distEntry = path.join(packageRoot, packageJson.exports['.'].default)
  if (!existsSync(distEntry)) {
    throw new Error(
      'Missing @sanity/astro build output. Run `pnpm --filter @sanity/astro build` before integration tests.',
    )
  }
}
