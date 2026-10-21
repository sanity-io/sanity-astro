declare namespace App {
  interface Locals {
    audience: import('./lib/audience').Audience | undefined
    preview: import('./lib/preview').PreviewState
    /** Path prefix of the current edition (`''`, `/preview` or `/for/<audience>`). */
    basePath: string
  }
}
