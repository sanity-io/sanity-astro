export function releaseYear(releaseDate: string): number {
  return new Date(releaseDate).getUTCFullYear()
}

export function releaseDateLong(releaseDate: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(releaseDate))
}
