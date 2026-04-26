import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { FlashToast } from "@/components/ui/flash-toast";
import { CookieBanner } from "@/components/cookie-banner";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "CosplayXclusive — Premium Cosplay Creator Platform",
  description:
    "Subscribe to your favorite cosplay creators. Exclusive content, premium photos, and direct fan support.",
  openGraph: {
    title: "CosplayXclusive",
    description: "Premium cosplay creator platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen antialiased">
        {/* Google Consent Mode v2 — must register defaults BEFORE gtag.js loads
            so the tag never reads/writes analytics storage without consent. */}
        <Script
          id="gtag-consent-default"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('consent', 'default', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'denied',
                wait_for_update: 500,
              });
              try {
                var raw = localStorage.getItem('cxc_cookie_consent_v1');
                if (raw) {
                  var parsed = JSON.parse(raw);
                  if (parsed && parsed.choice === 'all') {
                    gtag('consent', 'update', { analytics_storage: 'granted' });
                  }
                }
              } catch (e) {}
            `,
          }}
        />
        {children}
        <FlashToast />
        <CookieBanner />
        <SpeedInsights />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-JME245NWG0"
          strategy="afterInteractive"
        />
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              gtag('js', new Date());
              gtag('config', 'G-JME245NWG0');
            `,
          }}
        />
      </body>
    </html>
  );
}
