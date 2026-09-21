import { Link } from 'react-router-dom'
import { SiteFooter, SiteHeader } from '../components/SiteHeader'
import { PRODUCTS } from '../lib/products'
import { PricingCards } from './Pricing'

export function Landing() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="container hero__inner">
            <span className="eyebrow">For e-commerce brands, creators & POD sellers</span>
            <h1>
              Create, launch and grow
              <br />
              <span className="accent-text">from one place.</span>
            </h1>
            <p className="hero__lead">
              Selamont turns your product photos into content, shows you what’s holding your store back, runs your
              drops, and connects you with creators who get paid when you sell.
            </p>
            <div className="hero__cta">
              <Link to="/login?mode=signup" className="btn btn--primary btn--lg">Start free</Link>
              <Link to="/pricing" className="btn btn--ghost btn--lg">See pricing</Link>
            </div>
            <p className="hero__note muted">No card required for the Starter plan.</p>
          </div>
        </section>

        <section id="products" className="section">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow">The platform</span>
              <h2>Everything a growing brand needs</h2>
            </div>
            <div className="product-grid">
              {PRODUCTS.map((p) => (
                <article key={p.slug} className="product-card">
                  <div className="product-card__icon" aria-hidden="true">{p.icon}</div>
                  <h3>{p.name}</h3>
                  <p className="product-card__tagline">{p.tagline}</p>
                  <p className="muted">{p.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="container split">
            <div>
              <span className="eyebrow">Creator marketplace</span>
              <h2>Pay creators for performance, not a monthly fee</h2>
              <p className="muted">
                Send products to creators, approve the content they make, and share an agreed commission on the sales it
                drives. Selamont charges a disclosed platform fee only when money moves through a deal.
              </p>
            </div>
            <ol className="steps">
              <li><strong>Post a brief.</strong> Describe the product and the commission you’re offering.</li>
              <li><strong>Ship the product.</strong> Pick creators and send them samples.</li>
              <li><strong>Approve content.</strong> Nothing goes live without your sign-off.</li>
              <li><strong>Pay on results.</strong> Creators earn on attributed sales.</li>
            </ol>
          </div>
        </section>

        <section className="section" id="pricing">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow">Pricing</span>
              <h2>Start free. Upgrade when you’re growing.</h2>
            </div>
            <PricingCards />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
