import {execFileSync} from 'node:child_process'

const forbidden = /\.(test|stub)\.|\.d\.ts\.map$|\/integration\//

const report = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)
// npm <= 11 prints an array of packs; npm 12 prints one object keyed by package name.
const {files} = Array.isArray(report) ? report[0] : Object.values(report)[0]
const leaked = files.map((file) => file.path).filter((path) => forbidden.test(path))

if (leaked.length > 0) {
  console.error(`Tarball contains files that must not ship:\n  ${leaked.join('\n  ')}`)
  process.exit(1)
}

console.log(`Tarball contains ${files.length} files, none of them test or stub files.`)
