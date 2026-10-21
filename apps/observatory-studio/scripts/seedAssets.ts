/**
 * Seed images are rendered from parameterized SVG so the dataset can be
 * rebuilt from scratch without binary fixtures in the repository. Star
 * placement uses a seeded PRNG, so every run produces identical artwork.
 */

interface SkyTheme {
  top: string
  bottom: string
  star: string
  accent: string
}

/** Deterministic 32-bit PRNG (mulberry32), so seeded art never drifts. */
function prng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function starfield(
  seed: number,
  count: number,
  {width, height, star}: {width: number; height: number; star: string},
): string {
  const random = prng(seed)
  const stars: string[] = []
  for (let index = 0; index < count; index += 1) {
    const x = Math.round(random() * width)
    const y = Math.round(random() * height)
    const r = random() < 0.88 ? 1.2 + random() * 1.6 : 3 + random() * 2.4
    const opacity = (0.35 + random() * 0.65).toFixed(2)
    stars.push(
      `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${star}" opacity="${opacity}"/>`,
    )
  }
  return stars.join('')
}

/** Subtle film grain so flat night gradients don't band on large displays. */
function grain(width: number, height: number, rx = 28): string {
  return `
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"/>
  </filter>
  <rect width="${width}" height="${height}" rx="${rx}" filter="url(#grain)"/>`
}

function skyGradient(theme: SkyTheme): string {
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.top}"/>
      <stop offset="1" stop-color="${theme.bottom}"/>
    </linearGradient>
  </defs>`
}

/** Observatory dome on its hill, drawn as layered silhouettes with a lit slit. */
function domeSilhouette(cx: number, groundY: number, scale: number, accent: string): string {
  const r = 190 * scale
  const baseW = 300 * scale
  const baseH = 80 * scale
  const slitW = 26 * scale
  return `
  <g>
    <rect x="${cx - baseW / 2}" y="${groundY - baseH}" width="${baseW}" height="${baseH}" fill="#0d1220"/>
    <path d="M${cx - r} ${groundY - baseH} a${r} ${r} 0 0 1 ${2 * r} 0 Z" fill="#111830"/>
    <rect x="${cx - slitW / 2}" y="${groundY - baseH - r * 0.98}" width="${slitW}" height="${r * 0.95}" rx="${slitW / 2}" fill="${accent}" opacity="0.9"/>
    <rect x="${cx - baseW / 2 + 24 * scale}" y="${groundY - baseH + 26 * scale}" width="${40 * scale}" height="${18 * scale}" rx="${9 * scale}" fill="${accent}" opacity="0.55"/>
  </g>`
}

function hillside(width: number, groundY: number, height: number): string {
  return `<path d="M0 ${groundY + 40} Q ${width * 0.3} ${groundY - height} ${width * 0.62} ${groundY} T ${width} ${groundY - 20} L ${width} ${height + groundY} L 0 ${height + groundY} Z" fill="#070b16"/>`
}

/** Night panorama: the dome under a full starfield and a soft Milky Way band. */
export function nightSkySvg(theme: SkyTheme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2400" viewBox="0 0 1920 1200">
  ${skyGradient(theme)}
  <defs>
    <linearGradient id="milkyway" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.star}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${theme.star}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${theme.star}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1200" rx="28" fill="url(#sky)"/>
  <ellipse cx="1150" cy="480" rx="1300" ry="230" transform="rotate(-24 1150 480)" fill="url(#milkyway)"/>
  ${starfield(11, 260, {width: 1920, height: 950, star: theme.star})}
  ${hillside(1920, 1000, 200)}
  ${domeSilhouette(1210, 1010, 1.15, theme.accent)}
  ${grain(1920, 1200)}
</svg>`
}

/** Dusk scene for the family edition: crescent moon, early stars, warm horizon. */
export function duskMoonSvg(theme: SkyTheme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2400" viewBox="0 0 1920 1200">
  ${skyGradient(theme)}
  <defs>
    <radialGradient id="horizon" cx="0.5" cy="1.05" r="0.9">
      <stop offset="0" stop-color="${theme.accent}" stop-opacity="0.45"/>
      <stop offset="0.55" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1200" rx="28" fill="url(#sky)"/>
  <rect width="1920" height="1200" rx="28" fill="url(#horizon)"/>
  ${starfield(23, 120, {width: 1920, height: 800, star: theme.star})}
  <g transform="translate(1430 300)">
    <circle r="150" fill="#f6ecd2"/>
    <circle cx="-58" cy="-30" r="150" fill="url(#sky)"/>
  </g>
  <path d="M280 240 l340 118" stroke="${theme.star}" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
  <circle cx="626" cy="360" r="9" fill="${theme.star}"/>
  ${hillside(1920, 1000, 170)}
  ${domeSilhouette(620, 1010, 1.0, theme.accent)}
  ${grain(1920, 1200)}
</svg>`
}

/** Deep-sky scene for the stargazer edition: telescope, nebula, dense stars. */
export function deepSkySvg(theme: SkyTheme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2400" viewBox="0 0 1920 1200">
  ${skyGradient(theme)}
  <defs>
    <radialGradient id="nebulaA" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebulaB" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${theme.accent}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1200" rx="28" fill="url(#sky)"/>
  <ellipse cx="1240" cy="360" rx="560" ry="320" fill="url(#nebulaA)"/>
  <ellipse cx="1420" cy="470" rx="380" ry="230" fill="url(#nebulaB)"/>
  ${starfield(47, 420, {width: 1920, height: 1000, star: theme.star})}
  ${hillside(1920, 1040, 140)}
  <g stroke="#0d1220" stroke-width="34" stroke-linecap="round">
    <path d="M560 1040 L680 780"/>
    <path d="M800 1040 L680 780"/>
    <path d="M680 1040 L680 880"/>
  </g>
  <rect x="560" y="596" width="330" height="86" rx="43" transform="rotate(-32 560 596)" fill="#111830"/>
  <circle cx="838" cy="520" r="10" fill="${theme.star}"/>
  ${grain(1920, 1200)}
</svg>`
}

/** Abstract avatar: head and shoulders crossed by a thin orbit line. */
export function avatarSvg(hueA: string, hueB: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hueA}"/>
      <stop offset="1" stop-color="${hueB}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="196" r="86" fill="#ffffff" fill-opacity="0.92"/>
  <path d="M100 512a156 156 0 0 1 312 0Z" fill="#ffffff" fill-opacity="0.92"/>
  <ellipse cx="256" cy="256" rx="215" ry="72" transform="rotate(-18 256 256)" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="10"/>
  ${grain(512, 512, 0)}
</svg>`
}

/** Open Graph card: dome mark and a constellation, no text (host fonts vary). */
export function ogSvg(theme: SkyTheme): string {
  const constellation = '1380,900 1560,760 1740,820 1920,600 2100,660 2240,430'
  const nodes = constellation
    .split(' ')
    .map((point) => {
      const [x, y] = point.split(',')
      return `<circle cx="${x}" cy="${y}" r="16" fill="${theme.star}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1260" viewBox="0 0 2400 1260">
  <rect width="2400" height="1260" fill="${theme.top}"/>
  ${starfield(7, 130, {width: 2400, height: 1260, star: theme.star})}
  <g transform="translate(240 220)">
    <path d="M0 260 a130 130 0 0 1 260 0 Z" fill="none" stroke="${theme.accent}" stroke-width="30"/>
    <rect x="116" y="64" width="28" height="130" rx="14" fill="${theme.accent}"/>
    <rect x="-30" y="260" width="320" height="30" rx="15" fill="${theme.accent}"/>
  </g>
  <rect x="240" y="640" width="720" height="56" rx="28" fill="#ffffff"/>
  <rect x="240" y="740" width="520" height="40" rx="20" fill="#475069"/>
  <polyline points="${constellation}" fill="none" stroke="${theme.accent}" stroke-width="10" opacity="0.85"/>
  ${nodes}
</svg>`
}

export const THEME_NIGHT: SkyTheme = {
  top: '#050814',
  bottom: '#14204a',
  star: '#e8ecff',
  accent: '#fbbf24',
}
export const THEME_DUSK: SkyTheme = {
  top: '#241a4d',
  bottom: '#6b3a63',
  star: '#f4e9d4',
  accent: '#fb923c',
}
export const THEME_DEEP: SkyTheme = {
  top: '#030309',
  bottom: '#0a1024',
  star: '#dbe4ff',
  accent: '#2dd4bf',
}
