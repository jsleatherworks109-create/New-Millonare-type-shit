export type Plan = 'free' | 'growth' | 'scale'

export const PLAN_RANK: Record<Plan, number> = { free: 0, growth: 1, scale: 2 }

export function hasAccess(current: Plan, required: Plan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required]
}

export interface PlanInfo {
  id: Plan
  name: string
  price: number
  blurb: string
  features: string[]
  highlight?: boolean
}

// Prices shown here are display copy only. What customers are actually charged
// is set by the Stripe price IDs configured on the server (see README).
export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Starter',
    price: 0,
    blurb: 'Try the platform and join the creator marketplace.',
    features: [
      'Store Analyzer score + top 3 issues (3 scans/day)',
      'Creator marketplace access',
      'One launch page with countdown & waitlist',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 29,
    blurb: 'Everything a growing brand needs to create and launch.',
    features: [
      'Content Engine (40 content packs/day)',
      'Full Store Analyzer reports with AI fixes & mobile speed',
      'Unlimited drops + AI launch announcements',
      'Everything in Starter',
    ],
    highlight: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 79,
    blurb: 'For brands running launches every month.',
    features: [
      'Launch analytics for every drop',
      'Higher limits: 150 content packs & 100 scans/day',
      'Everything in Growth',
    ],
  },
]

/** Disclosed marketplace fee, as a % of creator commission. Shown to both sides before they agree. */
export const PLATFORM_FEE_PCT = 10

export function planName(plan: Plan): string {
  return PLANS.find((p) => p.id === plan)!.name
}
