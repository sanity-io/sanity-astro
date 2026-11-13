import {readFileSync, realpathSync} from 'node:fs'
import {dirname, join} from 'node:path'

export interface InstalledPackage {
  /** Real directory of the package; its own dependencies resolve from here. */
  dir: string
  version: string
  exports: unknown
}

function readManifest(path: string): InstalledPackage | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  const manifest = JSON.parse(text) as {version?: unknown; exports?: unknown}
  return {
    dir: realpathSync(dirname(path)),
    version: String(manifest.version ?? 'unknown'),
    exports: manifest.exports,
  }
}

/**
 * Finds `name` through the `node_modules` directories above `from`, the way Node resolves a bare
 * import from a file in `from`. `createRequire` is not used on purpose: it also searches
 * `NODE_PATH`, which pnpm's bin shims point at the hoisted store, so a package that is not
 * installed next to `from` would resolve to whichever version happens to be hoisted there; and it
 * caches `package.json` files, hiding version changes within one process.
 */
export function findInstalledPackage(name: string, from: string): InstalledPackage | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const found = readManifest(join(dir, 'node_modules', name, 'package.json'))
    if (found) {
      return found
    }
    if (dirname(dir) === dir) {
      return undefined
    }
  }
}

export function hasExport(pkg: InstalledPackage, subpath: string): boolean {
  return typeof pkg.exports === 'object' && pkg.exports !== null && subpath in pkg.exports
}
