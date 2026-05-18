import { PostHog } from 'posthog-node'

let posthogClient: PostHog | null = null
let warned = false

/**
 * Returns the server-side PostHog client, or `null` when no project token is
 * configured. Returning null instead of throwing keeps analytics strictly
 * optional — request handlers can `getPostHogClient()?.capture(...)` without
 * wrapping every call in a try/catch.
 *
 * The previous implementation used `process.env.NEXT_PUBLIC_POSTHOG_TOKEN!`,
 * which TypeScript-asserts away undefined but explodes at runtime: the
 * PostHog constructor throws "You must pass your PostHog project's api key."
 * That landed inside a long-running route after the DB insert had already
 * succeeded, causing empty-body 500s in production whenever the env var was
 * missing in a deployment. Always returning a value (real client or null)
 * keeps the rest of the codebase safe.
 */
export function getPostHogClient(): PostHog | null {
  if (posthogClient) return posthogClient

  const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN
  if (!token) {
    if (!warned) {
      console.warn('[posthog] NEXT_PUBLIC_POSTHOG_TOKEN is not set — server-side analytics disabled')
      warned = true
    }
    return null
  }

  posthogClient = new PostHog(token, {
    host:          process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt:       1,
    flushInterval: 0,
  })
  return posthogClient
}
