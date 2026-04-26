'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const APPEARANCE = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#e0407a',
    colorBackground: '#1a1a2e',
    colorText: '#e8e8f0',
    colorTextSecondary: '#9999b3',
    colorDanger: '#f87171',
    borderRadius: '10px',
    fontSizeBase: '14px',
  },
}

function CheckoutForm({
  label,
  onSuccess,
  onCancel,
}: {
  label: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe    = useStripe()
  const elements  = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)

    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (err) {
      setError(err.message ?? 'Payment failed. Please try again.')
      setLoading(false)
    } else if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      onSuccess()
    } else {
      setError('Unexpected payment status. Please contact support.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(224,64,122,0.3)]"
      >
        {loading ? 'Processing…' : label}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="w-full py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        Cancel
      </button>
    </form>
  )
}

interface PaymentModalProps {
  clientSecret: string
  label: string
  title: string
  subtitle?: string
  onSuccess: () => void
  onClose: () => void
}

export function PaymentModal({ clientSecret, label, title, subtitle, onSuccess, onClose }: PaymentModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-primary mb-1">{title}</h2>
          {subtitle && <p className="text-sm text-text-secondary mb-5">{subtitle}</p>}
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: APPEARANCE }}
          >
            <CheckoutForm label={label} onSuccess={onSuccess} onCancel={onClose} />
          </Elements>
        </div>
      </div>
    </div>
  )
}
