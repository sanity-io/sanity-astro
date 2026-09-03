import {execFileSync} from 'node:child_process'

const forbidden = /\.(test|stub)\.|\.d\.ts\.map$|\/integration\//

// npm <12 prints an array of tarballs, npm >=12 an object keyed by package name.
const output = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)
const [{files}] = Array.isArray(output) ? output : Object.values(output)
const leaked = files.map((file) => file.path).filter((path) => forbidden.test(path))

if (leaked.length > 0) {
  console.error(`Tarball contains files that must not ship:\n  ${leaked.join('\n  ')}`)
  process.exit(1)
}

console.log(`Tarball contains ${files.length} files, none of them test or stub files.`)
