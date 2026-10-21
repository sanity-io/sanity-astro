declare namespace App {
  interface Locals {
    audience: import('./lib/audience').Audience | undefined
    preview: import('./lib/preview').PreviewState
  }
}
