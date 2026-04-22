import Link from 'next/link'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const metadata = {
  title: 'Terms & Conditions — CosplayXclusive',
}

export default async function TermsPage() {
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
        <h1 className="text-3xl font-bold text-text-primary mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 19, 2026 &nbsp;·&nbsp; Operated by <strong className="text-text-secondary">Aquarix LLC</strong>
        </p>

        <div className="prose-cosplay space-y-10 text-text-secondary leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using CosplayXclusive (&quot;Platform&quot;, &quot;Service&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;),
              operated by Aquarix LLC, you agree to be bound by these Terms &amp; Conditions
              (&quot;Terms&quot;). If you do not agree to all of these Terms, you may not access or use the Platform.
              We may update these Terms from time to time; continued use of the Platform after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">2. Eligibility</h2>
            <p>
              You must be at least <strong>18 years of age</strong> to create an account or access any content
              on CosplayXclusive. By registering, you represent and warrant that you are 18 or older and
              have the legal capacity to enter into these Terms. Aquarix LLC reserves the right to
              terminate accounts and remove content if we have reason to believe a user is underage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">3. Account Registration</h2>
            <p>
              You must provide accurate and complete information when creating an account. You are
              responsible for maintaining the confidentiality of your login credentials and for all
              activities that occur under your account. You may not share your account, sell access to
              it, or use another person&apos;s account without permission. Notify us immediately at{' '}
              <a href="mailto:support@cosplayxclusive.com" className="text-accent hover:underline">
                support@cosplayxclusive.com
              </a>{' '}
              if you suspect unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">4. Creator Accounts</h2>
            <p>
              Creators wishing to monetize content must apply and be approved by Aquarix LLC. Approved
              creators may upload content, set subscription prices, and offer pay-per-view posts. By
              uploading content you grant CosplayXclusive a non-exclusive, worldwide, royalty-free license
              to host, display, and distribute your content solely for the purpose of operating the
              Platform. You retain ownership of your content at all times.
            </p>
            <p className="mt-2">
              Creators are solely responsible for the content they publish. Any content that violates
              these Terms may be removed without notice and the creator&apos;s account may be suspended or
              permanently terminated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">5. Prohibited Content &amp; Conduct</h2>
            <p>You may not post, upload, or distribute content that:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li>Depicts or promotes minors in a sexual or exploitative manner (zero tolerance; will be reported to NCMEC and law enforcement).</li>
              <li>Is non-consensual, including intimate images shared without explicit consent.</li>
              <li>Constitutes harassment, hate speech, threats, or incites violence against any person or group.</li>
              <li>Infringes any third party&apos;s intellectual property, privacy, or publicity rights.</li>
              <li>Contains malware, spam, or deceptive content.</li>
              <li>Violates any applicable local, state, national, or international law or regulation.</li>
            </ul>
            <p className="mt-2">
              You may not use the Platform to engage in fraud, impersonation, chargebacks abuse, or
              unauthorized scraping of content or user data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">6. Subscriptions &amp; Payments</h2>
            <p>
              Subscriptions are billed on a recurring monthly basis unless cancelled. Pay-per-view (PPV)
              content is purchased as a one-time transaction. All payments are processed through Stripe.
              By providing payment information you authorize us to charge your payment method for the
              applicable fees.
            </p>
            <p className="mt-2">
              <strong>Refunds:</strong> All sales are final. We do not offer refunds for subscription
              fees or PPV purchases except where required by law. If you believe a charge was made in
              error, contact us at{' '}
              <a href="mailto:support@cosplayxclusive.com" className="text-accent hover:underline">
                support@cosplayxclusive.com
              </a>.
            </p>
            <p className="mt-2">
              <strong>Creator payouts:</strong> Aquarix LLC retains a platform fee on all transactions.
              The current fee schedule is communicated to creators during onboarding. Payouts are
              processed via Stripe Connect on a rolling basis subject to Stripe&apos;s payout schedule and
              our fraud review policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">7. Intellectual Property</h2>
            <p>
              The CosplayXclusive name, logo, and platform software are owned by Aquarix LLC and
              protected by applicable intellectual property laws. You may not reproduce, distribute,
              modify, or create derivative works of Platform materials without our prior written consent.
              Content uploaded by creators remains the intellectual property of the respective creator.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">8. Privacy</h2>
            <p>
              Your use of the Platform is also governed by our{' '}
              <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>,
              which is incorporated into these Terms by reference. Please review it carefully.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">9. Disclaimers &amp; Limitation of Liability</h2>
            <p>
              The Platform is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without warranties of any kind,
              express or implied. Aquarix LLC does not warrant that the Platform will be uninterrupted,
              error-free, or free of viruses. To the maximum extent permitted by law, Aquarix LLC&apos;s
              total liability to you for any claims arising from your use of the Platform shall not
              exceed the greater of (a) the total fees you paid to us in the twelve months preceding the
              claim, or (b) USD $100.
            </p>
            <p className="mt-2">
              In no event shall Aquarix LLC be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of or inability to use the
              Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">10. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Aquarix LLC and its officers, directors,
              employees, and agents from and against any claims, liabilities, damages, losses, and
              expenses (including reasonable legal fees) arising out of or in connection with your use of
              the Platform, your violation of these Terms, or your violation of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">11. Termination</h2>
            <p>
              We may suspend or terminate your account at any time for any reason, including breach of
              these Terms, with or without notice. You may delete your account at any time by contacting
              support. Upon termination, your right to use the Platform ceases immediately. Provisions
              that by their nature should survive termination (including Sections 7, 9, 10, and 12)
              shall survive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">12. Governing Law &amp; Dispute Resolution</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, United States, without
              regard to its conflict-of-law provisions. Any dispute arising from these Terms or your use
              of the Platform shall first be attempted to be resolved informally by contacting us. If
              not resolved within 30 days, disputes shall be settled by binding individual arbitration
              in accordance with the American Arbitration Association rules. You waive any right to
              participate in class-action proceedings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">13. Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. When we make material changes, we
              will update the &quot;Last updated&quot; date above and, where appropriate, notify you via email or
              an in-Platform notice. Your continued use of the Platform after changes take effect
              constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">14. Contact</h2>
            <p>
              For questions about these Terms, please contact Aquarix LLC at:
            </p>
            <address className="not-italic mt-2 text-sm bg-bg-card border border-border rounded-xl p-4">
              <strong className="text-text-primary">Aquarix LLC</strong><br />
              Email:{' '}
              <a href="mailto:legal@cosplayxclusive.com" className="text-accent hover:underline">
                legal@cosplayxclusive.com
              </a><br />
              Support:{' '}
              <a href="mailto:support@cosplayxclusive.com" className="text-accent hover:underline">
                support@cosplayxclusive.com
              </a>
            </address>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  )
}
