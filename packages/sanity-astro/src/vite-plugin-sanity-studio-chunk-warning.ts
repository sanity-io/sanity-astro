import type {PluginOption, UserConfig} from 'vite'

const DEFAULT_CHUNK_SIZE_WARNING_LIMIT = 500

const STUDIO_CHUNK_PATTERNS = [
  'studio-component',
  '@sanity/astro/studio',
  'sanity:studio',
  'studio-route',
]

type ChunkLike = {
  name?: string
  fileName: string
  facadeModuleId?: string | null
  moduleIds?: string[]
  imports?: string[]
  dynamicImports?: string[]
  code?: string
}

function includesStudioChunkPattern(text: string): boolean {
  const lowerText = text.toLowerCase()
  return STUDIO_CHUNK_PATTERNS.some((pattern) => lowerText.includes(pattern))
}

export function isStudioChunkRoot(chunk: ChunkLike): boolean {
  const chunkFields = [chunk.name, chunk.fileName, chunk.facadeModuleId, ...(chunk.moduleIds ?? [])]
  const chunkText = chunkFields
    .filter((field): field is string => typeof field === 'string')
    .join(' ')
  return includesStudioChunkPattern(chunkText)
}

export function collectStudioChunkFiles(chunksByFileName: Map<string, ChunkLike>): Set<string> {
  const studioChunkFiles = new Set<string>()
  const toVisit: string[] = []

  for (const chunk of chunksByFileName.values()) {
    if (isStudioChunkRoot(chunk)) {
      toVisit.push(chunk.fileName)
    }
  }

  while (toVisit.length > 0) {
    const nextFileName = toVisit.pop()
    if (!nextFileName || studioChunkFiles.has(nextFileName)) {
      continue
    }

    studioChunkFiles.add(nextFileName)
    const chunk = chunksByFileName.get(nextFileName)
    if (!chunk) {
      continue
    }

    for (const importedChunk of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      if (chunksByFileName.has(importedChunk) && !studioChunkFiles.has(importedChunk)) {
        toVisit.push(importedChunk)
      }
    }
  }

  return studioChunkFiles
}

export function formatLargeChunkWarning(
  limitInKb: number,
  oversizedChunkFileNames: string[],
): string {
  const chunkList = oversizedChunkFileNames.map((fileName) => `- ${fileName}`).join('\n')
  return `Some chunks are larger than ${limitInKb} kB after minification. Consider:
${chunkList}
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.`
}

export function getOversizedNonStudioChunks(
  chunksByFileName: Map<string, ChunkLike>,
  chunkSizeWarningLimitInKb: number,
): string[] {
  const studioChunkFiles = collectStudioChunkFiles(chunksByFileName)
  const oversizedNonStudioChunks: string[] = []

  for (const chunk of chunksByFileName.values()) {
    if (studioChunkFiles.has(chunk.fileName)) {
      continue
    }
    const chunkCode = chunk.code ?? ''
    const chunkSizeInKb = Buffer.byteLength(chunkCode, 'utf8') / 1024
    if (chunkSizeInKb > chunkSizeWarningLimitInKb) {
      oversizedNonStudioChunks.push(chunk.fileName)
    }
  }

  return oversizedNonStudioChunks
}

export function vitePluginSanityStudioChunkWarning(): PluginOption {
  let chunkSizeWarningLimitInKb = DEFAULT_CHUNK_SIZE_WARNING_LIMIT

  return {
    name: 'vite-plugin-sanity-studio-chunk-warning',
    apply: 'build',
    config(config: UserConfig) {
      if (typeof config.build?.chunkSizeWarningLimit === 'number') {
        chunkSizeWarningLimitInKb = config.build.chunkSizeWarningLimit
      }

      return {
        build: {
          chunkSizeWarningLimit: Number.MAX_SAFE_INTEGER,
        },
      }
    },
    generateBundle(_, bundle) {
      const chunksByFileName = new Map<string, ChunkLike>()
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          continue
        }

        chunksByFileName.set(output.fileName, {
          name: output.name,
          fileName: output.fileName,
          facadeModuleId: output.facadeModuleId,
          moduleIds: Object.keys(output.modules),
          imports: output.imports,
          dynamicImports: output.dynamicImports,
          code: output.code,
        })
      }

      const oversizedNonStudioChunks = getOversizedNonStudioChunks(
        chunksByFileName,
        chunkSizeWarningLimitInKb,
      )

      if (oversizedNonStudioChunks.length > 0) {
        this.warn(formatLargeChunkWarning(chunkSizeWarningLimitInKb, oversizedNonStudioChunks))
      }
    },
  }
}
