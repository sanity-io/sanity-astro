import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {build, type Rollup} from 'vite'

import {getAvailablePort} from '../dev-server'

export interface StandInServer {
  baseUrl: string
  /** The stand-in page embedding `appUrl` in its preview iframe. */
  pageUrl: (appUrl: string) => string
  stop: () => Promise<void>
}

const entry = fileURLToPath(new URL('./stand-in.ts', import.meta.url))

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Presentation stand-in</title>
    <style>
      html, body { margin: 0; height: 100%; }
      iframe { border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe title="preview"></iframe>
    <script type="module" src="/stand-in.js"></script>
  </body>
</html>
`

async function bundleStandIn(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {entry, formats: ['es'], fileName: 'stand-in'},
      rollupOptions: {},
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).filter(
    (item): item is Rollup.RollupOutput => 'output' in item,
  )
  const chunk = outputs
    .flatMap((output) => output.output)
    .find((item): item is Rollup.OutputChunk => item.type === 'chunk' && item.isEntry)
  if (!chunk) {
    throw new Error('Vite produced no entry chunk for the Presentation stand-in')
  }
  return chunk.code
}

export async function serveStandIn(): Promise<StandInServer> {
  const script = await bundleStandIn()
  const port = await getAvailablePort()
  const server = createServer((request, response) => {
    const {pathname} = new URL(request.url ?? '/', 'http://localhost')
    if (pathname === '/') {
      response.writeHead(200, {'content-type': 'text/html; charset=utf-8'}).end(html)
    } else if (pathname === '/stand-in.js') {
      response.writeHead(200, {'content-type': 'text/javascript'}).end(script)
    } else {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    baseUrl,
    pageUrl: (appUrl) => `${baseUrl}/?app=${encodeURIComponent(appUrl)}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
