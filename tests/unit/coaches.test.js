import { describe, test, expect } from 'vitest'
import { getFilteredCoaches, getApMatches, getUniqueStates } from '../../js/coaches.js'

const DB = [
  { id: 'fsu', name: 'Florida State University', abbr: 'FSU', div: 'D1', conf: 'ACC', state: 'FL',
    coaches: [{ role: 'Head Coach', name: 'Link Jarrett' }] },
  { id: 'uf', name: 'University of Florida', abbr: 'UF', div: 'D1', conf: 'SEC', state: 'FL', coaches: [] },
  { id: 'chipola', name: 'Chipola College', abbr: 'Chipola', div: 'JUCO', conf: 'FCCAA', state: 'FL', coaches: [] },
  { id: 'uga', name: 'University of Georgia', abbr: 'UGA', div: 'D1', conf: 'SEC', state: 'GA', coaches: [] },
  { id: 'nc_state', name: 'NC State University', abbr: 'NC State', div: 'D1', conf: 'ACC', state: 'NC', coaches: [] },
]

describe('getFilteredCoaches', () => {
  test('returns all with no filters', () => {
    expect(getFilteredCoaches(DB, {}).length).toBe(5)
  })
  test('filters by division', () => {
    expect(getFilteredCoaches(DB, { divFilter: 'JUCO' }).length).toBe(1)
    expect(getFilteredCoaches(DB, { divFilter: 'D1' }).length).toBe(4)
  })
  test('filters by state', () => {
    expect(getFilteredCoaches(DB, { stateFilter: 'GA' }).length).toBe(1)
    expect(getFilteredCoaches(DB, { stateFilter: 'FL' }).length).toBe(3)
  })
  test('filters by search — school name', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'florida' }).length).toBe(2)
  })
  test('filters by search — abbreviation', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'fsu' }).length).toBe(1)
  })
  test('filters by search — coach name', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'jarrett' }).length).toBe(1)
  })
  test('filters by search — state code', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'GA' }).length).toBeGreaterThanOrEqual(1)
  })
  test('combines div and state filters', () => {
    expect(getFilteredCoaches(DB, { divFilter: 'D1', stateFilter: 'FL' }).length).toBe(2)
  })
  test('search is case-insensitive', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'FLORIDA' }).length).toBe(2)
  })
})

describe('getApMatches', () => {
  test('returns all when no filters or sentIds', () => {
    expect(getApMatches(DB, {}).length).toBe(5)
  })
  test('filters by divisions array', () => {
    expect(getApMatches(DB, { apDivs: ['JUCO'] }).length).toBe(1)
  })
  test('filters by states array', () => {
    expect(getApMatches(DB, { apStates: ['GA'] }).length).toBe(1)
  })
  test('excludes sentIds', () => {
    const sentIds = new Set(['fsu', 'uf'])
    const result = getApMatches(DB, { sentIds })
    expect(result.find(c => c.id === 'fsu')).toBeUndefined()
    expect(result.find(c => c.id === 'uf')).toBeUndefined()
    expect(result.length).toBe(3)
  })
  test('empty apDivs means no div filter', () => {
    expect(getApMatches(DB, { apDivs: [] }).length).toBe(5)
  })
})

describe('getUniqueStates', () => {
  test('returns sorted unique states', () => {
    const states = getUniqueStates(DB)
    expect(states).toEqual(['FL', 'GA', 'NC'])
  })
})
