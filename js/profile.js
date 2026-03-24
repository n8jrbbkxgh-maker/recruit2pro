// js/profile.js
// Pure functions — no DOM, no Supabase. Testable in Node.

const READINESS_FIELDS = ['name','pos','year','hometown','school','gpa','stats','film','email']

export function calcReadiness(profile) {
  const filled = READINESS_FIELDS.filter(f => {
    const v = profile[f]
    return v && String(v).trim().length > 0
  }).length
  return Math.round((filled / READINESS_FIELDS.length) * 100)
}

export function getNextStep(profile, emailCount = 0) {
  if (!profile.name) return 'Complete your player profile to get started'
  if (!profile.pos) return 'Add your position to your profile'
  if (!profile.stats) return 'Add your stats (velocity, GPA, batting avg…) to your profile'
  if (!profile.film) return 'Add a Hudl or YouTube film link to your profile'
  if (!profile.email) return 'Add your email address so coaches can reply'
  if (emailCount === 0) return 'Write your first coach email — tap "Write Email"'
  if (emailCount < 5) return 'Send emails to 5+ coaches — use Autopilot to scale'
  return 'Keep sending — most recruits hear back after 8-12 emails per school'
}

export function validateGPA(value) {
  if (!value || value === '') return null
  const n = parseFloat(value)
  if (isNaN(n)) return 'GPA must be a number'
  if (n < 0 || n > 4.0) return 'GPA must be between 0.0 and 4.0'
  return null
}

export function validateGradYear(value) {
  if (!value || value === '') return null
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 2025 || n > 2030) return 'Grad year must be between 2025 and 2030'
  return null
}

export function validateFilmUrl(value) {
  if (!value || value === '') return null
  const hudl = /^https?:\/\/(www\.)?hudl\.com\//i
  const youtube = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/i
  if (hudl.test(value) || youtube.test(value)) return null
  return 'Film link must be a Hudl or YouTube URL'
}

export function validateProfile(profile) {
  const errors = {}
  const gpaErr = validateGPA(profile.gpa)
  const yearErr = validateGradYear(profile.year)
  const filmErr = validateFilmUrl(profile.film)
  if (gpaErr) errors.gpa = gpaErr
  if (yearErr) errors.year = yearErr
  if (filmErr) errors.film = filmErr
  return { valid: Object.keys(errors).length === 0, errors }
}
