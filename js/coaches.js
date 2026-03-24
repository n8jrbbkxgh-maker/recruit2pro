// js/coaches.js

export function getFilteredCoaches(coachDB, { divFilter = 'all', stateFilter = 'all', searchQuery = '' } = {}) {
  const q = searchQuery.toLowerCase().trim()
  return coachDB.filter(c => {
    if (divFilter !== 'all' && c.div !== divFilter) return false
    if (stateFilter !== 'all' && c.state !== stateFilter) return false
    if (q) {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.abbr && c.abbr.toLowerCase().includes(q)) ||
        c.state.toLowerCase().includes(q) ||
        c.conf.toLowerCase().includes(q) ||
        c.coaches.some(hc => hc.name && hc.name.toLowerCase().includes(q))
      )
    }
    return true
  })
}

export function getApMatches(coachDB, { apDivs = [], apStates = [], sentIds = new Set() } = {}) {
  return coachDB.filter(c => {
    if (apDivs.length && !apDivs.includes(c.div)) return false
    if (apStates.length && !apStates.includes(c.state)) return false
    if (sentIds.has(c.id)) return false
    return true
  })
}

export function getUniqueStates(coachDB) {
  return [...new Set(coachDB.map(c => c.state))].sort()
}
