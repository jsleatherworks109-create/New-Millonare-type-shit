import type { ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { findProduct } from '../lib/products'
import { Analytics } from './engines/Analytics'
import { ContentEngine } from './engines/ContentEngine'
import { Creators } from './engines/Creators'
import { Drops } from './engines/Drops'
import { StoreAnalyzer } from './engines/StoreAnalyzer'

const ENGINES: Record<string, ComponentType> = {
  content: ContentEngine,
  analyzer: StoreAnalyzer,
  drops: Drops,
  creators: Creators,
  analytics: Analytics,
}

export function ProductPage() {
  const { slug } = useParams()
  const product = findProduct(slug)
  const Engine = slug ? ENGINES[slug] : undefined
  if (!product || !Engine) return <Navigate to="/app" replace />

  return (
    <div className="page">
      <header className="page__head">
        <h1><span className="page__icon" aria-hidden="true">{product.icon}</span>{product.name}</h1>
        <p className="muted">{product.tagline}</p>
      </header>
      <Engine />
    </div>
  )
}
