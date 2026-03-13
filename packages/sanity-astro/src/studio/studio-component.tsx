import React from 'react'
import {createHashHistory, type History, type Listener} from 'history'
// @ts-ignore
import {config} from 'sanity:studio'
import {Studio} from 'sanity'

if (!config) {
  throw new Error(
    "[@sanity/astro]: Can't load Sanity Studio. Check that you've configured it in `sanity.config.js|ts`.",
  )
}

export function StudioComponent(props: {history?: 'browser' | 'hash'}) {
  const history = React.useMemo(
    () => (props.history === 'hash' ? createHashHistoryForStudio() : undefined),
    [props.history],
  )

  React.useEffect(() => {
    if (props.history !== 'hash' || typeof window === 'undefined') {
      return
    }

    const hashWithoutPrefix = window.location.hash.replace(/^#/, '')
    if (hashWithoutPrefix.length > 0) {
      return
    }

    const firstWorkspaceBasePath = getFirstWorkspaceBasePath(config)
    const nextHashPath = firstWorkspaceBasePath.startsWith('/')
      ? firstWorkspaceBasePath
      : `/${firstWorkspaceBasePath}`

    const nextUrl = `${window.location.pathname}${window.location.search}#${nextHashPath}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [props.history])

  React.useEffect(() => {
    if (
      props.history !== 'hash' ||
      typeof window === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return
    }

    const workspaceBasePaths = getWorkspaceBasePaths(config)
    if (workspaceBasePaths.size === 0) {
      return
    }

    function onDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }

      const eventTarget = event.target
      if (!(eventTarget instanceof Element)) {
        return
      }

      const anchor = eventTarget.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      if (anchor.target && anchor.target !== '_self') {
        return
      }

      const targetUrl = new URL(anchor.href, window.location.origin)
      if (targetUrl.origin !== window.location.origin) {
        return
      }

      if (!workspaceBasePaths.has(targetUrl.pathname)) {
        return
      }

      event.preventDefault()
      window.location.hash = targetUrl.pathname
    }

    document.addEventListener('click', onDocumentClick, true)
    return () => {
      document.removeEventListener('click', onDocumentClick, true)
    }
  }, [props.history])

  return (
    <div
      data-ui="AstroStudioLayout"
      style={{
        height: '100vh',
        maxHeight: '100dvh',
        overscrollBehavior: 'none',
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}
    >
      <Studio config={config} unstable_history={history} />
    </div>
  )
}

export function StudioComponentHash() {
  return <StudioComponent history="hash" />
}

function getFirstWorkspaceBasePath(studioConfig: unknown): string {
  if (Array.isArray(studioConfig)) {
    const firstWorkspace = studioConfig[0] as {basePath?: unknown} | undefined
    if (typeof firstWorkspace?.basePath === 'string' && firstWorkspace.basePath.length > 0) {
      return firstWorkspace.basePath
    }
    return '/'
  }

  const configWithBasePath = studioConfig as {basePath?: unknown}
  if (typeof configWithBasePath?.basePath === 'string' && configWithBasePath.basePath.length > 0) {
    return configWithBasePath.basePath
  }

  return '/'
}

function getWorkspaceBasePaths(studioConfig: unknown): Set<string> {
  if (Array.isArray(studioConfig)) {
    return new Set(
      studioConfig
        .map((workspace) => (workspace as {basePath?: unknown})?.basePath)
        .filter(
          (basePath): basePath is string => typeof basePath === 'string' && basePath.length > 0,
        ),
    )
  }

  const configWithBasePath = studioConfig as {basePath?: unknown}
  if (typeof configWithBasePath?.basePath === 'string' && configWithBasePath.basePath.length > 0) {
    return new Set([configWithBasePath.basePath])
  }

  return new Set()
}

function createHashHistoryForStudio(): History {
  const history = createHashHistory()
  return {
    get action() {
      return history.action
    },
    get location() {
      return history.location
    },
    get createHref() {
      return history.createHref
    },
    get push() {
      return history.push
    },
    get replace() {
      return history.replace
    },
    get go() {
      return history.go
    },
    get back() {
      return history.back
    },
    get forward() {
      return history.forward
    },
    get block() {
      return history.block
    },
    // Overriding listen to workaround a problem where native history provides history.listen(location => void), but the npm package is history.listen(({action, location}) => void)
    listen(listener: Listener) {
      return history.listen(({location}) => {
        // @ts-expect-error -- working around a bug? in studio
        listener(location)
      })
    },
  }
}
