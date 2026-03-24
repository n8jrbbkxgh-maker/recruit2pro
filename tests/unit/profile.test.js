import { describe, test, expect } from 'vitest'
import {
  calcReadiness, getNextStep,
  validateGPA, validateGradYear, validateFilmUrl, validateProfile
} from '../../js/profile.js'

const FULL_PROFILE = {
  name: 'Jake Smith', pos: 'RHP', year: '2026',
  hometown: 'Tampa, FL', school: 'Plant High School',
  gpa: '3.5', stats: '90mph FB', film: 'https://hudl.com/v/abc', email: 'jake@email.com'
}

describe('calcReadiness', () => {
  test('returns 0 for empty profile', () => {
    expect(calcReadiness({})).toBe(0)
  })
  test('returns 100 for fully filled profile', () => {
    expect(calcReadiness(FULL_PROFILE)).toBe(100)
  })
  test('returns ~11 for only name filled (1 of 9 fields)', () => {
    expect(calcReadiness({ name: 'Jake' })).toBe(11)
  })
  test('ignores unknown fields', () => {
    expect(calcReadiness({ name: 'Jake', foo: 'bar' })).toBe(11)
  })
})

describe('getNextStep', () => {
  test('prompts to complete profile when name missing', () => {
    expect(getNextStep({}, 0)).toContain('profile')
  })
  test('prompts to add position when pos missing', () => {
    expect(getNextStep({ name: 'Jake' }, 0)).toContain('position')
  })
  test('prompts to add stats when stats missing', () => {
    expect(getNextStep({ name: 'Jake', pos: 'RHP' }, 0)).toContain('stats')
  })
  test('prompts to add film when film missing', () => {
    expect(getNextStep({ name: 'Jake', pos: 'RHP', stats: '90mph' }, 0)).toContain('film')
  })
  test('prompts to write first email when profile full but no emails', () => {
    expect(getNextStep(FULL_PROFILE, 0)).toContain('email')
  })
  test('prompts to scale when fewer than 5 emails', () => {
    expect(getNextStep(FULL_PROFILE, 3)).toContain('5')
  })
  test('encourages continued outreach at 5+ emails', () => {
    const msg = getNextStep(FULL_PROFILE, 10)
    expect(msg.length).toBeGreaterThan(0)
  })
})

describe('validateGPA', () => {
  test('returns null for valid GPA', () => {
    expect(validateGPA('3.5')).toBeNull()
    expect(validateGPA('4.0')).toBeNull()
    expect(validateGPA('0.0')).toBeNull()
    expect(validateGPA('')).toBeNull() // optional field
  })
  test('returns error for GPA above 4.0', () => {
    expect(validateGPA('4.1')).toMatch(/4\.0/)
  })
  test('returns error for negative GPA', () => {
    expect(validateGPA('-1')).toMatch(/0/)
  })
  test('returns error for non-numeric', () => {
    expect(validateGPA('abc')).toBeTruthy()
  })
})

describe('validateGradYear', () => {
  test('returns null for valid years', () => {
    expect(validateGradYear('2025')).toBeNull()
    expect(validateGradYear('2030')).toBeNull()
    expect(validateGradYear('')).toBeNull() // optional
  })
  test('returns error for year below 2025', () => {
    expect(validateGradYear('2024')).toBeTruthy()
  })
  test('returns error for year above 2030', () => {
    expect(validateGradYear('2031')).toBeTruthy()
  })
})

describe('validateFilmUrl', () => {
  test('accepts Hudl URLs', () => {
    expect(validateFilmUrl('https://www.hudl.com/video/3/12345/abc')).toBeNull()
  })
  test('accepts YouTube watch URLs', () => {
    expect(validateFilmUrl('https://www.youtube.com/watch?v=abc123')).toBeNull()
  })
  test('accepts youtu.be short URLs', () => {
    expect(validateFilmUrl('https://youtu.be/abc123')).toBeNull()
  })
  test('accepts empty string (field is optional)', () => {
    expect(validateFilmUrl('')).toBeNull()
  })
  test('rejects other URLs', () => {
    expect(validateFilmUrl('https://vimeo.com/123')).toBeTruthy()
    expect(validateFilmUrl('https://google.com')).toBeTruthy()
  })
})

describe('validateProfile', () => {
  test('returns valid for empty profile (all optional at save time)', () => {
    const result = validateProfile({})
    expect(result.valid).toBe(true)
  })
  test('returns invalid when GPA is out of range', () => {
    const result = validateProfile({ gpa: '5.0' })
    expect(result.valid).toBe(false)
    expect(result.errors.gpa).toBeTruthy()
  })
  test('returns invalid when film URL is not Hudl/YouTube', () => {
    const result = validateProfile({ film: 'https://vimeo.com/123' })
    expect(result.valid).toBe(false)
    expect(result.errors.film).toBeTruthy()
  })
})
