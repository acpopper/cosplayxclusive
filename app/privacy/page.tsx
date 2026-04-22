import Link from 'next/link'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const metadata = {
  title: 'Privacy Policy — CosplayXclusive',
}

export default async function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 19, 2026 &nbsp;·&nbsp; Operated by <strong className="text-text-secondary">Aquarix LLC</strong>
        </p>

        <div className="space-y-10 text-text-secondary leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">1. Introduction</h2>
            <p>
              Aquarix LLC (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates CosplayXclusive (the &quot;Platform&quot;). This Privacy
              Policy explains how we collect, use, disclose, and safeguard your personal information
              when you use our Platform. By using CosplayXclusive you agree to the practices described
              in this policy. If you do not agree, please discontinue use of the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">2. Information We Collect</h2>

            <h3 className="text-base font-semibold text-text-primary mt-4 mb-2">2.1 Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Account information:</strong> username, email address, password (hashed), role (fan/creator).</li>
              <li><strong>Profile information:</strong> display name, bio, avatar image, fandom tags, subscription pricing.</li>
              <li><strong>Payment information:</strong> billing details collected and processed by Stripe. We do not store raw card numbers.</li>
              <li><strong>Content:</strong> photos, captions, messages, and comments you upload or send.</li>
              <li><strong>Communications:</strong> messages or emails sent to our support team.</li>
            </ul>

            <h3 className="text-base font-semibold text-text-primary mt-4 mb-2">2.2 Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Usage data:</strong> pages visited, features used, clicks, and session duration.</li>
              <li><strong>Device &amp; browser data:</strong> IP address, browser type, operating system, and device identifiers.</li>
              <li><strong>Cookies &amp; similar technologies:</strong> session cookies for authentication and analytics cookies for performance measurement.</li>
            </ul>

            <h3 className="text-base font-semibold text-text-primary mt-4 mb-2">2.3 Information from third parties</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Stripe:</strong> transaction identifiers, payout status, and fraud signals.</li>
              <li><strong>Vercel:</strong> hosting and edge-network performance data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li>Create and manage your account and authenticate your identity.</li>
              <li>Process subscriptions, pay-per-view purchases, tips, and creator payouts.</li>
              <li>Deliver content you have subscribed to or purchased.</li>
              <li>Send transactional emails (e.g., receipts, account alerts).</li>
              <li>Send service announcements and policy updates.</li>
              <li>Detect, prevent, and investigate fraud, abuse, and security incidents.</li>
              <li>Comply with legal obligations and enforce our{' '}
                <Link href="/terms" className="text-accent hover:underline">Terms &amp; Conditions</Link>.
              </li>
              <li>Improve and personalise the Platform through aggregate analytics.</li>
            </ul>
            <p className="mt-2">
              We do <strong>not</strong> sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">4. Sharing of Information</h2>
            <p>We may share your information in the following circumstances:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li>
                <strong>Service providers:</strong> Supabase (database &amp; storage), Stripe (payments), and Vercel
                (hosting) — only to the extent necessary to provide the Platform.
              </li>
              <li>
                <strong>Other users:</strong> your public profile information (username, display name, avatar, bio)
                is visible to other users. Content you publish is visible according to the access level you set
                (free / subscriber-only / pay-per-view).
              </li>
              <li>
                <strong>Legal requirements:</strong> we may disclose information when required by law, subpoena,
                court order, or to protect our legal rights, or if we believe disclosure is necessary to prevent
                imminent harm or illegal activity.
              </li>
              <li>
                <strong>Child safety:</strong> we will report any apparent child sexual abuse material (CSAM) to
                the National Center for Missing &amp; Exploited Children (NCMEC) and cooperate fully with law
                enforcement investigations.
              </li>
              <li>
                <strong>Business transfers:</strong> in the event of a merger, acquisition, or sale of all or
                substantially all of our assets, your information may be transferred to the acquiring entity.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">5. Cookies &amp; Tracking Technologies</h2>
            <p>
              We use essential cookies for authentication (session management) and may use analytics
              cookies to understand how the Platform is used. You can disable non-essential cookies in
              your browser settings; however, doing so may affect Platform functionality, including your
              ability to stay logged in.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">6. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to
              provide services to you. If you delete your account, we will delete or anonymise your
              personal information within 30 days, except where we are required to retain it for legal
              compliance, fraud prevention, or dispute resolution purposes.
            </p>
            <p className="mt-2">
              Content you have published may remain visible if other users have legitimately obtained
              access (e.g., purchased a PPV post) unless subject to a valid takedown request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">7. Data Security</h2>
            <p>
              We implement industry-standard security measures including TLS encryption in transit,
              encrypted storage at rest via Supabase, hashed passwords (via Supabase Auth), and
              role-based access controls. No method of transmission or storage is 100% secure, and we
              cannot guarantee absolute security. Please notify us immediately at{' '}
              <a href="mailto:security@cosplayxclusive.com" className="text-accent hover:underline">
                security@cosplayxclusive.com
              </a>{' '}
              if you believe your account has been compromised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">8. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the following rights regarding your personal
              information:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li><strong>Access:</strong> request a copy of the personal data we hold about you.</li>
              <li><strong>Correction:</strong> request correction of inaccurate or incomplete data.</li>
              <li><strong>Deletion:</strong> request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
              <li><strong>Portability:</strong> receive your data in a structured, machine-readable format.</li>
              <li><strong>Objection / restriction:</strong> object to or restrict certain processing activities.</li>
              <li><strong>Withdraw consent:</strong> where processing is based on consent, withdraw it at any time.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@cosplayxclusive.com" className="text-accent hover:underline">
                privacy@cosplayxclusive.com
              </a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">9. Children&apos;s Privacy</h2>
            <p>
              CosplayXclusive is intended solely for users who are 18 years of age or older. We do not
              knowingly collect personal information from persons under 18. If we discover that a minor
              has provided us with personal information, we will delete it immediately and terminate the
              associated account. If you believe a minor has registered, please contact us at{' '}
              <a href="mailto:support@cosplayxclusive.com" className="text-accent hover:underline">
                support@cosplayxclusive.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">10. International Transfers</h2>
            <p>
              CosplayXclusive is operated from the United States. If you access the Platform from
              outside the United States, your information may be transferred to and processed in the
              United States or other countries where our service providers operate. By using the
              Platform, you consent to this transfer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">11. Third-Party Links</h2>
            <p>
              The Platform may contain links to third-party websites or services. We are not responsible
              for the privacy practices of those third parties and encourage you to review their privacy
              policies before providing any personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. When we make material changes, we will
              update the &quot;Last updated&quot; date and, where appropriate, notify you by email or in-Platform
              notice. Your continued use of the Platform after changes take effect constitutes
              acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">13. Contact &amp; Data Controller</h2>
            <p>
              The data controller for personal information collected through CosplayXclusive is:
            </p>
            <address className="not-italic mt-2 text-sm bg-bg-card border border-border rounded-xl p-4">
              <strong className="text-text-primary">Aquarix LLC</strong><br />
              Privacy enquiries:{' '}
              <a href="mailto:privacy@cosplayxclusive.com" className="text-accent hover:underline">
                privacy@cosplayxclusive.com
              </a><br />
              Security reports:{' '}
              <a href="mailto:security@cosplayxclusive.com" className="text-accent hover:underline">
                security@cosplayxclusive.com
              </a><br />
              General support:{' '}
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
