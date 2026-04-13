import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-text-primary">
            <span className="text-accent text-xl">✦</span>
            <span className="hidden sm:inline">CosplayXclusive</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-[0_0_15px_rgba(224,64,122,0.25)]"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-4 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px]" />
          <div className="absolute w-[400px] h-[400px] rounded-full bg-accent-alt/5 blur-[100px] translate-x-32" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-muted px-4 py-1.5 text-xs font-medium text-accent mb-6">
            <span>✦</span>
            <span>The premium cosplay creator platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary leading-[1.1]">
            Support the cosplayers
            <br />
            <span className="bg-gradient-to-r from-accent to-accent-alt bg-clip-text text-transparent">
              you love
            </span>
          </h1>

          <p className="mt-6 text-lg text-text-secondary max-w-xl mx-auto leading-relaxed">
            Exclusive content, behind-the-scenes photos, and direct access to your favorite
            cosplay creators — all in one premium platform.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-[0_0_30px_rgba(224,64,122,0.3)] text-base"
            >
              Start exploring free →
            </Link>
            <Link
              href="/explore"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-semibold border border-border bg-bg-card text-text-primary hover:border-accent/30 transition-colors text-base"
            >
              Browse creators
            </Link>
          </div>

          <p className="mt-4 text-xs text-text-muted">
            Free to join · No credit card required
          </p>
        </div>
      </section>

      {/* Social proof / stats */}
      <section className="py-12 border-y border-border bg-bg-card/30">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-3 gap-6 text-center">
            {[
              { value: '1,000+', label: 'Creators' },
              { value: '50K+', label: 'Fans' },
              { value: '$2M+', label: 'Paid to creators' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl sm:text-3xl font-bold text-text-primary">{value}</p>
                <p className="text-sm text-text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary">
              Everything fans & creators need
            </h2>
            <p className="mt-3 text-text-secondary">
              Built from the ground up for cosplay culture
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: '🔒',
                title: 'Exclusive Content',
                desc: 'Subscriber-only photo sets, behind-the-scenes, and WIP shots not posted anywhere else.',
              },
              {
                icon: '💳',
                title: 'Monthly Subscriptions',
                desc: 'Unlock full access to a creator\'s content for a monthly fee they set themselves.',
              },
              {
                icon: '📸',
                title: 'Pay Per View',
                desc: 'Unlock individual premium photo sets without committing to a subscription.',
              },
              {
                icon: '💰',
                title: 'Direct Creator Support',
                desc: 'Creators keep 80% of all earnings. Payouts go directly to their bank via Stripe.',
              },
              {
                icon: '🎭',
                title: 'Cosplay-First',
                desc: 'Not a generic platform — built with cosplay community culture and fandoms in mind.',
              },
              {
                icon: '✦',
                title: 'Premium Quality',
                desc: 'High-quality photos stored securely. Original files never shared without permission.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-bg-card border border-border rounded-2xl p-5 hover:border-accent/20 transition-colors"
              >
                <div className="text-2xl mb-3">{icon}</div>
                <h3 className="font-semibold text-text-primary mb-1.5">{title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Creators */}
      <section className="py-20 px-4 bg-bg-card/20 border-y border-border">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent-alt/20 bg-accent-alt-muted px-4 py-1.5 text-xs font-medium text-accent-alt mb-4">
                For Creators
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-4">
                Turn your passion
                <br />
                into income
              </h2>
              <p className="text-text-secondary mb-6 leading-relaxed">
                Set your own subscription price, post exclusive content, and earn directly from your
                most dedicated fans. No algorithm — just your fans, your content, your money.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Set any monthly price you choose',
                  'Earn from both subscriptions and PPV posts',
                  'Get paid via direct bank transfer',
                  'Keep 80% of all earnings',
                  'Apply in minutes — go live fast',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-text-secondary">
                    <span className="text-accent">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Apply as creator →
              </Link>
            </div>

            {/* Mock creator card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent-alt/10 rounded-3xl blur-2xl" />
              <div className="relative bg-bg-card border border-border rounded-2xl overflow-hidden">
                <div className="h-32 bg-gradient-to-br from-accent/20 to-accent-alt/20" />
                <div className="p-5 -mt-10">
                  <div className="h-16 w-16 rounded-full border-4 border-bg-card bg-gradient-to-br from-accent to-accent-alt flex items-center justify-center mb-3">
                    <span className="text-xl font-bold text-white">★</span>
                  </div>
                  <h3 className="font-bold text-text-primary">StarCosplay</h3>
                  <p className="text-xs text-text-secondary mt-0.5">@starcosplay</p>
                  <p className="text-xs text-text-muted mt-2 mb-3">
                    Anime &amp; gaming cosplayer. 200+ outfits. Weekly exclusive photoshoots.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['Anime', 'JRPG', 'Fantasy'].map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-xs bg-bg-elevated text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="bg-accent rounded-xl p-3 text-center">
                    <p className="text-white font-semibold text-sm">Subscribe · $6.99/mo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Fans */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Mock post grid */}
            <div className="grid grid-cols-3 gap-2 order-2 lg:order-1">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl overflow-hidden bg-bg-elevated"
                  style={{
                    background: `linear-gradient(${135 + i * 20}deg, rgba(224,64,122,${0.1 + i * 0.05}) 0%, rgba(155,93,229,${0.1 + i * 0.04}) 100%)`,
                  }}
                >
                  {i < 2 && (
                    <div className="h-full flex items-center justify-center text-text-muted text-xs">
                      ✦
                    </div>
                  )}
                  {i >= 2 && (
                    <div className="h-full flex items-center justify-center backdrop-blur-sm">
                      <span className="text-lg">🔒</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-muted px-4 py-1.5 text-xs font-medium text-accent mb-4">
                For Fans
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-4">
                The content you
                <br />
                can&apos;t find anywhere else
              </h2>
              <p className="text-text-secondary mb-6 leading-relaxed">
                Get exclusive access to your favorite cosplayers&apos; best work.
                High-resolution photos, exclusive sets, and direct access — not the filtered
                highlights from social media.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Full-res photo sets not on Instagram',
                  'Behind-the-scenes & WIP content',
                  'Subscribe or buy individual posts',
                  'Cancel anytime, no questions asked',
                  'Secure payments via Stripe',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-text-secondary">
                    <span className="text-accent">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold bg-bg-card border border-border text-text-primary hover:border-accent/30 transition-colors"
              >
                Browse creators →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] rounded-full bg-accent/8 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            Ready to get started?
          </h2>
          <p className="text-text-secondary mb-8 text-lg">
            Join thousands of cosplay fans and creators already on the platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup?role=creator"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-6 rounded-xl font-semibold border border-border bg-bg-card text-text-primary hover:border-accent/30 transition-colors"
            >
              Join as creator
            </Link>
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-6 rounded-xl font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-[0_0_30px_rgba(224,64,122,0.25)]"
            >
              Join as fan →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <span className="text-accent">✦</span>
            <span>CosplayXclusive</span>
          </div>
          <p className="text-xs text-text-muted">© 2025 CosplayXclusive. All rights reserved.</p>
          <div className="flex gap-4 text-xs text-text-muted">
            <span className="hover:text-text-secondary cursor-pointer transition-colors">Terms</span>
            <span className="hover:text-text-secondary cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-text-secondary cursor-pointer transition-colors">Support</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
