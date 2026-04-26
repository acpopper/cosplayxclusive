import Link from 'next/link'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { CookiePreferencesButton } from './cookie-preferences-button'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const metadata = {
  title: 'Cookie Policy — CosplayXclusive',
}

export default async function CookiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: Profile | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile} />

      <main className="mx-auto max-w-3xl w-full px-4 py-12 flex-1">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Cookie Policy</h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 26, 2026 &nbsp;·&nbsp; Operated by{' '}
          <strong className="text-text-secondary">Aquarix LLC</strong>
        </p>

        <div className="space-y-10 text-text-secondary leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">1. Introduction</h2>
            <p>
              This Cookie Policy explains how Aquarix LLC (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) uses
              cookies and similar technologies on CosplayXclusive (the &quot;Platform&quot;). It should be
              read together with our{' '}
              <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>
              {' '}and our{' '}
              <Link href="/terms" className="text-accent hover:underline">Terms &amp; Conditions</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">2. What Are Cookies?</h2>
            <p>
              Cookies are small text files placed on your device by a website to remember information
              about you, such as your login state or preferences. We also use similar technologies
              including local storage, session storage, and pixel tags. In this policy &quot;cookies&quot;
              refers to all of these technologies.
            </p>
            <p className="mt-2">
              Cookies set by us are called <strong>first-party cookies</strong>. Cookies set by domains
              other than ours are called <strong>third-party cookies</strong>; they enable third-party
              features such as analytics and payment processing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">3. Categories of Cookies We Use</h2>

            <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">3.1 Strictly necessary</h3>
            <p>
              Required for the Platform to function. Without these cookies you cannot stay signed in
              or carry out essential actions such as paying for a subscription. They cannot be
              switched off.
            </p>

            <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">3.2 Performance &amp; analytics</h3>
            <p>
              Help us understand how visitors interact with the Platform — which pages are most
              visited, how long sessions last, how features perform. This data is aggregated and
              anonymous wherever possible. You can disable this category from the cookie banner or
              from your{' '}
              <CookiePreferencesButton className="text-accent hover:underline">
                cookie preferences
              </CookiePreferencesButton>.
            </p>

            <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">3.3 Functionality</h3>
            <p>
              Remember choices you make to give you a more personal experience — for example, age
              gate confirmation, recently viewed creators, or unsaved drafts in chat composition.
            </p>

            <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">3.4 Targeting / advertising</h3>
            <p>
              CosplayXclusive does <strong>not</strong> currently run third-party advertising
              networks and does not set targeting or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">4. Cookies in Use</h2>
            <p>
              The table below lists the most significant cookies and similar technologies we
              currently use. The list may evolve as we update the Platform; in case of conflict the
              current behaviour of the Platform prevails.
            </p>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-card">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated/60 text-left">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Name</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Provider</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">sb-*-auth-token</td>
                    <td className="px-3 py-2 text-xs">Supabase</td>
                    <td className="px-3 py-2 text-xs">Strictly necessary</td>
                    <td className="px-3 py-2 text-xs">Keeps you signed in across page loads.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">cxc_age_confirmed</td>
                    <td className="px-3 py-2 text-xs">CosplayXclusive</td>
                    <td className="px-3 py-2 text-xs">Functionality</td>
                    <td className="px-3 py-2 text-xs">Remembers age-gate confirmation so you do not see it on every visit.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">cxc_cookie_consent_v1</td>
                    <td className="px-3 py-2 text-xs">CosplayXclusive</td>
                    <td className="px-3 py-2 text-xs">Strictly necessary</td>
                    <td className="px-3 py-2 text-xs">Stores your cookie preferences so we do not show the banner again.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">__stripe_mid, __stripe_sid</td>
                    <td className="px-3 py-2 text-xs">Stripe</td>
                    <td className="px-3 py-2 text-xs">Strictly necessary</td>
                    <td className="px-3 py-2 text-xs">Fraud prevention during checkout. Set only on payment pages.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">ph_*_posthog</td>
                    <td className="px-3 py-2 text-xs">PostHog</td>
                    <td className="px-3 py-2 text-xs">Performance &amp; analytics</td>
                    <td className="px-3 py-2 text-xs">Product analytics — feature usage, session length, error reports.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">_ga, _ga_*</td>
                    <td className="px-3 py-2 text-xs">Google Analytics</td>
                    <td className="px-3 py-2 text-xs">Performance &amp; analytics</td>
                    <td className="px-3 py-2 text-xs">Aggregate site traffic and audience reporting.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">vercel-*</td>
                    <td className="px-3 py-2 text-xs">Vercel Speed Insights</td>
                    <td className="px-3 py-2 text-xs">Performance &amp; analytics</td>
                    <td className="px-3 py-2 text-xs">Page-load and Web Vitals measurement.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">5. Your Choices</h2>
            <p>
              When you first visit the Platform we show a cookie banner offering &quot;Accept all&quot; or
              &quot;Essential only&quot;. You can change your mind at any time:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li>
                Reopen the cookie banner from the{' '}
                <CookiePreferencesButton className="text-accent hover:underline">
                  cookie preferences
                </CookiePreferencesButton>
                {' '}link in the footer.
              </li>
              <li>
                Block or delete cookies in your browser settings — note that strictly-necessary
                cookies are required for sign-in to work.
              </li>
              <li>
                Use your browser&apos;s &quot;Do Not Track&quot; or Global Privacy Control (GPC) signal; we
                honour GPC as a request to opt out of analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">6. Third Parties</h2>
            <p>
              Some cookies are set by third parties acting as our service providers. We rely on the
              following:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li><strong>Supabase</strong> — authentication and database session cookies.</li>
              <li><strong>Stripe</strong> — payment processing and fraud prevention.</li>
              <li><strong>PostHog</strong> — product analytics.</li>
              <li><strong>Google Analytics</strong> — aggregated audience analytics.</li>
              <li><strong>Vercel</strong> — hosting, edge routing, and Speed Insights.</li>
            </ul>
            <p className="mt-2">
              These providers process information under their own privacy policies. We have
              configured Google Analytics in &quot;Consent Mode&quot; so analytics storage stays denied
              until you accept.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">7. Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time, for example when we add or remove
              tools. We will update the &quot;Last updated&quot; date at the top of the page; if changes
              are material we will surface them in the cookie banner.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">8. Contact</h2>
            <p>
              Questions about cookies, analytics, or this policy can be sent to{' '}
              <a href="mailto:privacy@cosplayxclusive.com" className="text-accent hover:underline">
                privacy@cosplayxclusive.com
              </a>.
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  )
}
