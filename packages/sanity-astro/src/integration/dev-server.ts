import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createServer} from 'node:net'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

export type DevServerHandle = {
  baseUrl: string
  port: number
  stop: () => Promise<void>
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate an ephemeral port')))
        return
      }

      const {port} = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

function waitForServerReady({
  process,
  baseUrl,
  timeoutMs,
}: {
  process: ChildProcessWithoutNullStreams
  baseUrl: string
  timeoutMs: number
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const output: string[] = []
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearInterval(pollInterval)
      clearTimeout(timeout)
      process.stdout.off('data', onStdout)
      process.stderr.off('data', onStderr)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    const onOutput = (chunk: Buffer) => {
      const text = chunk.toString()
      output.push(text)

      if (/ready in \d+/i.test(text) || text.includes(' watching for file changes')) {
        finish()
      }
    }

    const onStdout = onOutput
    const onStderr = onOutput

    process.stdout.on('data', onStdout)
    process.stderr.on('data', onStderr)

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(baseUrl, {redirect: 'manual'})
        if (response.ok || response.status === 304 || response.status < 500) {
          finish()
        }
      } catch {
        // Keep polling until the dev server is ready.
      }
    }, 1000)

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Timed out waiting for dev server at ${baseUrl}\n${output.join('').slice(-4000)}`,
        ),
      )
    }, timeoutMs)

    process.once('error', (error) => finish(error))
    process.once('exit', (code) => {
      if (!settled) {
        finish(
          new Error(
            `Dev server exited before becoming ready (code ${code ?? 'unknown'})\n${output.join('').slice(-4000)}`,
          ),
        )
      }
    })
  })
}

export async function startAstroDevServer({
  appDirectory,
  timeoutMs = 180_000,
  disableModuleDedupe = false,
  env = {},
}: {
  appDirectory: string
  timeoutMs?: number
  disableModuleDedupe?: boolean
  env?: Record<string, string>
}): Promise<DevServerHandle> {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const appRoot = path.resolve(repoRoot, appDirectory)
  const astroBin = path.join(appRoot, 'node_modules', '.bin', 'astro')

  const childProcess = spawn(
    astroBin,
    ['dev', '--host', '127.0.0.1', '--port', String(port), '--force'],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        CI: 'true',
        NO_COLOR: '1',
        ...env,
        ...(disableModuleDedupe ? {SANITY_ASTRO_DISABLE_MODULE_DEDUPE: '1'} : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  await waitForServerReady({process: childProcess, baseUrl, timeoutMs})

  return {
    baseUrl,
    port,
    stop: async () => {
      if (childProcess.exitCode !== null || childProcess.killed) {
        return
      }

      childProcess.kill('SIGTERM')

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (childProcess.exitCode === null && !childProcess.killed) {
            childProcess.kill('SIGKILL')
          }
          resolve()
        }, 5_000)

        childProcess.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      try {
        const astroStop = spawn(astroBin, ['dev', 'stop'], {
          cwd: appRoot,
          stdio: 'ignore',
        })
        await new Promise<void>((resolve) => {
          astroStop.once('exit', () => resolve())
          setTimeout(() => {
            if (astroStop.exitCode === null && !astroStop.killed) {
              astroStop.kill('SIGTERM')
            }
            resolve()
          }, 3_000)
        })
      } catch {
        // Best-effort cleanup for Astro's dev lock file.
      }
    },
  }
}
