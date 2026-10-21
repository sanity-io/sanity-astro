/**
 * All seeded content for the observatory site: the base (published) documents
 * plus the personalized home page content for each audience variant.
 */

export interface SeedAssetIds {
  heroNight: string
  heroDusk: string
  heroDeep: string
  avatarIngrid: string
  avatarAmara: string
  avatarTomas: string
  og: string
}

export const VARIANT_DEFINITIONS = [
  {
    variantId: 'families',
    title: 'Families',
    description: 'Visitors planning a family outing or arriving from family-focused channels.',
    conditions: {audience: 'families'},
  },
  {
    variantId: 'stargazers',
    title: 'Stargazers',
    description: 'Amateur astronomers and astrophotographers, often from astronomy communities.',
    conditions: {audience: 'stargazers'},
  },
] as const

const TICKETS_URL = 'https://tickets.zenith-observatory.example'

function image(assetId: string, alt: string) {
  return {
    _type: 'image',
    asset: {_type: 'reference', _ref: assetId},
    alt,
  }
}

function link(key: string, label: string, href: string) {
  return {_key: key, _type: 'link', label, href}
}

export function siteSettingsDoc() {
  return {
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteTitle: 'Zenith Observatory',
    nav: [
      link('nav-highlights', 'Highlights', '/#highlights'),
      link('nav-visit', 'Visit', '/visit'),
    ],
    footerTagline: 'A public observatory and planetarium above the city glow.',
    footerLinks: [
      link('footer-home', 'Home', '/'),
      link('footer-visit', 'Plan your visit', '/visit'),
    ],
  }
}

export function homePageDoc(assets: SeedAssetIds) {
  return {
    _id: 'homePage',
    _type: 'homePage',
    hero: {
      _type: 'hero',
      eyebrow: 'Public observatory & planetarium',
      heading: 'The night sky, open to everyone.',
      tagline:
        'Zenith Observatory pairs an 8K planetarium dome with real mountaintop telescopes. Star shows, open observing nights and hands-on exhibits, from your first look through an eyepiece to your thousandth.',
      primaryCta: {_type: 'link', label: 'Book tickets', href: '/visit'},
      secondaryCta: {_type: 'link', label: 'See the highlights', href: '/#highlights'},
      image: image(
        assets.heroNight,
        'The observatory dome at night under a sky full of stars and the band of the Milky Way',
      ),
    },
    partnersHeading: 'In partnership with',
    partners: [
      'Aldera Institute',
      'Nordlys Station',
      'Kestrel University',
      'Meteor Society',
      'Callisto Foundation',
    ],
    highlightsHeading: 'Ways to meet the night sky',
    highlights: [
      {
        _key: 'highlight-dome',
        _type: 'highlight',
        icon: 'dome',
        title: 'Star shows under the dome',
        body: 'Live-narrated journeys across an 8K dome, from tonight\u2019s sky over the city to the edge of the observable universe. New shows every season.',
      },
      {
        _key: 'highlight-telescope',
        _type: 'highlight',
        icon: 'telescope',
        title: 'Open observing nights',
        body: 'Every clear Friday the big telescopes point at whatever the sky is showing off: planets, nebulae, star clusters. Astronomers stay until the last question.',
      },
      {
        _key: 'highlight-school',
        _type: 'highlight',
        icon: 'school',
        title: 'Learning that sticks',
        body: 'Curriculum-linked visits for schools and evening courses for grown-ups. Small groups, real instruments and plenty of time to ask why.',
      },
    ],
    testimonial: {
      _type: 'testimonial',
      quote:
        'I have taught the seasons for twenty years, and nothing has landed like ninety minutes under the dome. My students walked out arguing about where the universe ends.',
      name: 'Ingrid Solheim',
      role: 'Science teacher',
      affiliation: 'Fjellby Secondary School',
      avatar: image(assets.avatarIngrid, 'Ingrid Solheim'),
    },
    cta: {
      _type: 'callToAction',
      heading: 'Come see the sky for real',
      body: 'Open Tuesday to Sunday, with late observing nights every clear Friday. Members visit free all year.',
      cta: {_type: 'link', label: 'Plan your visit', href: '/visit'},
    },
    seo: {
      _type: 'seo',
      title: 'Zenith Observatory | Planetarium & observing nights',
      description:
        'Star shows under an 8K planetarium dome, open telescope nights and hands-on exhibits. Open Tuesday to Sunday above the city glow. Tickets from $14.',
      ogImage: {_type: 'image', asset: {_type: 'reference', _ref: assets.og}},
    },
  }
}

/**
 * Audience-specific home page content. Each variant document starts as a copy
 * of the base document; these patches replace the sections that speak to the
 * audience while shared sections (partner strip, highlights heading) inherit.
 */
export function homePageVariantContent(assets: SeedAssetIds) {
  return {
    families: {
      hero: {
        _type: 'hero',
        eyebrow: 'For families',
        heading: 'Make space for wonder.',
        tagline:
          'Half-hour star shows for young explorers, a junior astronaut trail through the exhibits, pram-friendly paths and a caf\u00e9 with the best view in town. Under-sixes always visit free.',
        primaryCta: {_type: 'link', label: 'Get family tickets', href: '/visit'},
        secondaryCta: {_type: 'link', label: 'See the highlights', href: '/#highlights'},
        image: image(
          assets.heroDusk,
          'A crescent moon and the first stars over the observatory dome at dusk',
        ),
      },
      highlights: [
        {
          _key: 'highlight-kids-shows',
          _type: 'highlight',
          icon: 'dome',
          title: 'Star shows for small stargazers',
          body: 'Gentle half-hour shows where the lights dim slowly, questions are welcome mid-flight and every seat is a window seat.',
        },
        {
          _key: 'highlight-trail',
          _type: 'highlight',
          icon: 'moon',
          title: 'The junior astronaut trail',
          body: 'A hands-on route through the exhibits: stamp your logbook at mission control, weigh yourself on Mars and land a paper rover.',
        },
        {
          _key: 'highlight-workshops',
          _type: 'highlight',
          icon: 'comet',
          title: 'School-holiday workshops',
          body: 'Build a comet from dry ice, launch a bottle rocket and grill a real astronomer. New missions every holiday, ages six and up.',
        },
      ],
      testimonial: {
        _type: 'testimonial',
        quote:
          'Our six-year-old ran the astronaut trail twice, then fell asleep in the car naming the moons of Jupiter. We bought the family pass on the way out.',
        name: 'Amara Osei',
        role: 'Parent of two',
        avatar: image(assets.avatarAmara, 'Amara Osei'),
      },
      cta: {
        _type: 'callToAction',
        heading: 'Turn a grey Sunday into a space mission',
        body: 'A family pass covers two adults and up to four kids, all year. Rainy days are our busiest for a reason.',
        cta: {_type: 'link', label: 'Get the family pass', href: '/visit'},
      },
      seo: {
        _type: 'seo',
        title: 'Zenith Observatory for families | Shows & trails',
        description:
          'Half-hour star shows for kids, a junior astronaut trail and school-holiday workshops. Pram-friendly, under-sixes free, open Tuesday to Sunday.',
        ogImage: {_type: 'image', asset: {_type: 'reference', _ref: assets.og}},
      },
    },
    stargazers: {
      hero: {
        _type: 'hero',
        eyebrow: 'For stargazers',
        heading: 'Dark skies. Serious glass.',
        tagline:
          'Book eyepiece time on the one-metre reflector, ride along to our dark-sky site and process your frames in the astrophotography lab. The city glow stays far below.',
        primaryCta: {_type: 'link', label: 'Join an observing night', href: '/visit'},
        secondaryCta: {_type: 'link', label: 'See the highlights', href: '/#highlights'},
        image: image(
          assets.heroDeep,
          'A telescope silhouetted against a deep night sky with a faint nebula overhead',
        ),
      },
      highlights: [
        {
          _key: 'highlight-reflector',
          _type: 'highlight',
          icon: 'telescope',
          title: 'Time on the one-metre',
          body: 'Members book eyepiece and imaging slots on the one-metre reflector. Winter waitlists are real; members skip most of the queue.',
        },
        {
          _key: 'highlight-lab',
          _type: 'highlight',
          icon: 'orbit',
          title: 'The astrophotography lab',
          body: 'Guided rigs, autoguiding that behaves and a stacking workstation for your own data. Bring a memory card, leave with a nebula.',
        },
        {
          _key: 'highlight-field-nights',
          _type: 'highlight',
          icon: 'comet',
          title: 'Dark-sky field nights',
          body: 'When the forecast cooperates we run a minibus to our dark-sky site, an hour past the last streetlight. Loaner dobsonians on board.',
        },
      ],
      testimonial: {
        _type: 'testimonial',
        quote:
          'I waited months for a clear new-moon Friday, and it delivered: three hours on the big scope and my first honest look at the Veil Nebula.',
        name: 'Tomas Keller',
        role: 'Astrophotographer',
        affiliation: 'Cloudbreak Imaging Club',
        avatar: image(assets.avatarTomas, 'Tomas Keller'),
      },
      cta: {
        _type: 'callToAction',
        heading: 'Skip the city glow',
        body: 'Stargazer members get priority telescope slots, lab access and first seats on dark-sky trips.',
        cta: {_type: 'link', label: 'See memberships', href: '/visit'},
      },
      seo: {
        _type: 'seo',
        title: 'Zenith Observatory for stargazers | Telescope time',
        description:
          'Eyepiece and imaging time on a one-metre reflector, an astrophotography lab and guided dark-sky field nights. Late openings every clear Friday.',
        ogImage: {_type: 'image', asset: {_type: 'reference', _ref: assets.og}},
      },
    },
  }
}

export function visitPageDoc(assets: SeedAssetIds) {
  return {
    _id: 'visitPage',
    _type: 'visitPage',
    heading: 'Plan your visit',
    tagline:
      'Open Tuesday to Sunday, 10:00 to 22:00, plus late observing nights every clear Friday. Tickets cover the dome, the exhibits and daytime solar viewing.',
    tiers: [
      {
        _key: 'tier-day-pass',
        _type: 'tier',
        name: 'Day pass',
        price: '$14',
        period: 'per person',
        description: 'Everything under the dome for a day, whatever the weather is doing.',
        features: [
          'One star show in the 8K dome',
          'All exhibits and the solar telescope',
          'Under-sixes free',
          'Caf\u00e9 with the best view in town',
        ],
        cta: {_type: 'link', label: 'Book a day pass', href: `${TICKETS_URL}/day-pass`},
        highlighted: false,
      },
      {
        _key: 'tier-stargazer',
        _type: 'tier',
        name: 'Stargazer',
        price: '$9',
        period: 'per month',
        description: 'For the ones who check the cloud forecast before the weather.',
        features: [
          'Unlimited visits, all year',
          'Priority slots on the one-metre reflector',
          'Astrophotography lab access',
          'First seats on dark-sky field nights',
          'Two guest passes a year',
        ],
        cta: {_type: 'link', label: 'Become a member', href: `${TICKETS_URL}/membership`},
        highlighted: true,
      },
      {
        _key: 'tier-family',
        _type: 'tier',
        name: 'Family pass',
        price: '$180',
        period: 'per year',
        description: 'Two adults and up to four kids, every open day of the year.',
        features: [
          'Unlimited visits for the whole crew',
          'Junior astronaut trail logbooks included',
          'Priority booking for holiday workshops',
          'Member prices for birthday missions',
        ],
        cta: {_type: 'link', label: 'Get the family pass', href: `${TICKETS_URL}/family`},
        highlighted: false,
      },
    ],
    seo: {
      _type: 'seo',
      title: 'Visit Zenith Observatory | Tickets & memberships',
      description:
        'Day passes from $14, Stargazer memberships with telescope time from $9 a month and family passes. Open Tuesday to Sunday above the city glow.',
      ogImage: {_type: 'image', asset: {_type: 'reference', _ref: assets.og}},
    },
  }
}
