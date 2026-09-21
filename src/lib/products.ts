import type { Plan } from './plans'

export interface Product {
  slug: string
  name: string
  tagline: string
  description: string
  /** Minimum plan to open the product at all. */
  required: Plan
  /** Needs the Supabase database (not available in demo mode). */
  needsDatabase: boolean
  icon: string
}

export const PRODUCTS: Product[] = [
  {
    slug: 'content',
    name: 'Content Engine',
    tagline: 'Photos in. Campaigns out.',
    description: 'Upload product photos or mockups and get hooks, captions, product descriptions, ad concepts and a launch plan.',
    required: 'growth',
    needsDatabase: false,
    icon: '✦',
  },
  {
    slug: 'analyzer',
    name: 'Store Analyzer',
    tagline: 'Find what’s costing you sales.',
    description: 'Enter your store URL for a clear report on conversion blockers, trust gaps, product pages and mobile experience.',
    required: 'free',
    needsDatabase: false,
    icon: '◎',
  },
  {
    slug: 'drops',
    name: 'Drops & Launches',
    tagline: 'Make every release an event.',
    description: 'Launch pages with countdowns and waitlists, plus AI-written announcements. Starter includes one launch page.',
    required: 'free',
    needsDatabase: true,
    icon: '▲',
  },
  {
    slug: 'creators',
    name: 'Creator Marketplace',
    tagline: 'Pay for results, not seats.',
    description: 'Post briefs, pick creators, approve their content and track commission on the sales they drive.',
    required: 'free',
    needsDatabase: true,
    icon: '◈',
  },
  {
    slug: 'analytics',
    name: 'Launch Analytics',
    tagline: 'Know what actually worked.',
    description: 'Page views, waitlist growth, click-throughs to your store and conversion rates for every drop.',
    required: 'scale',
    needsDatabase: true,
    icon: '▦',
  },
]

export function findProduct(slug: string | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug)
}
