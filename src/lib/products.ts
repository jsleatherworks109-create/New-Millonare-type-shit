export interface Product {
  slug: string
  name: string
  tagline: string
  description: string
  icon: string
}

export const PRODUCTS: Product[] = [
  {
    slug: 'content',
    name: 'Content Engine',
    tagline: 'Photos in. Campaigns out.',
    description: 'Upload product photos and get hooks, captions, product copy, ad concepts, content ideas and a launch plan.',
    icon: '✦',
  },
  {
    slug: 'analyzer',
    name: 'Store Analyzer',
    tagline: 'Find what’s costing you sales.',
    description: 'Scan any store page for conversion, trust, mobile and search problems, then get AI fixes.',
    icon: '◎',
  },
  {
    slug: 'drops',
    name: 'Drops & Launches',
    tagline: 'Make every release an event.',
    description: 'Launch pages with a countdown and waitlist, plus AI-written announcements.',
    icon: '▲',
  },
  {
    slug: 'creators',
    name: 'Creators',
    tagline: 'Track every creator deal.',
    description: 'Keep your creators, campaigns, shipped products, content links, sales and commission owed in one place.',
    icon: '◈',
  },
  {
    slug: 'analytics',
    name: 'Launch Analytics',
    tagline: 'Know what actually worked.',
    description: 'Page views, waitlist sign-ups, clicks to your store and conversion rates for every drop.',
    icon: '▦',
  },
]

export function findProduct(slug: string | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug)
}
