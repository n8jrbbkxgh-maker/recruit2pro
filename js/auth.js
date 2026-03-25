// js/auth.js
// Pure business logic at top (testable without Supabase).
// Async functions below require a Supabase client injected as first arg.

export function getAccessStatus(subscription) {
  if (!subscription) return 'blocked'
  if (subscription.status === 'active') return 'active'
  if (!subscription.grace_until) return 'blocked'
  if (new Date(subscription.grace_until) > new Date()) return 'grace'
  return 'blocked'
}

// Browser-only: redirect helpers (not tested with Vitest, tested with Playwright)
export async function requireAuth(supabase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '/auth.html'; return null }
  return session
}

export async function requireSubscription(supabase, userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, grace_until')
    .eq('user_id', userId)
    .maybeSingle()
  return getAccessStatus(data)
}
