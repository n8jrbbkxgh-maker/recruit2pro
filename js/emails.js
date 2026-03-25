// js/emails.js
export const EMAIL_SYSTEM_PROMPT = `You are a college baseball recruiting email specialist who has placed 200+ players in college programs. You write emails that coaches actually open and reply to. Your emails are short, specific, confident, and personal. You always address the coach by last name. You always name the specific school and conference. You never use generic filler language. Every email sounds like a real athlete wrote it.

NEVER use these phrases: "I have always dreamed", "hard worker", "honored", "great fit", "I believe I would", "passionate about baseball", "pursue my dreams", "take my game to the next level", "I am reaching out because", "give me the opportunity", "I feel that", "I am confident that".

FORMAT YOUR RESPONSE EXACTLY AS:
SUBJECT: [subject line]
BODY:
[email body only — no subject, no explanation]`

export function buildEmailPrompt(type, school, hc, profile, notes = '') {
  const p = profile || {}

  // Extract coach name parts
  const coachFullName = hc ? hc.name : 'Coach'
  const nameParts = coachFullName.split(' ')
  const coachLastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : coachFullName

  // Player info
  const playerFirst = p.name ? p.name.split(' ')[0] : 'Player'
  const playerName = p.name || '[Player Name]'
  const pos = p.pos || 'Baseball Player'
  const year = p.year || '[Year]'
  const hometown = p.hometown || '[Hometown]'
  const hsClub = p.school || '[High School/Club]'
  const gpa = p.gpa || ''
  const film = p.film || ''
  const stats = p.stats || '[Key stats]'

  // Program context
  const schoolName = school.name
  const division = school.div
  const conference = school.conf
  const programNotes = school.notes || `${division} program in the ${conference}`

  // Subject line formula
  const subject = `${pos} — ${playerName}, Class of ${year} — ${schoolName}`

  const templates = {
    first: `Write a first-contact recruiting email from ${playerName} (${pos}, Class of ${year}) to Coach ${coachLastName} at ${schoolName}.

REQUIREMENTS:
- Open with exactly: "Coach ${coachLastName},"
- First sentence names ${schoolName} and the ${conference} specifically
- Reference this specific program fact in the email: "${programNotes}"
- Include the player's best 2-3 stats from: ${stats}
- Hometown: ${hometown} | School/Club: ${hsClub}${gpa ? ' | GPA: ' + gpa : ''}${film ? ' | Film: ' + film : ''}
- End with ONE specific ask: a 10-minute call or permission to send film
- Sign off with just the player's first name: ${playerFirst}
- Body must be 100-140 words (not counting greeting and signoff)
- Sound like a confident 17-year-old athlete, not a cover letter
${notes ? '- Additional context: ' + notes : ''}

Use this EXACT subject line:
SUBJECT: ${subject}`,

    followup: `Write a follow-up recruiting email. ${playerName} (${pos}, Class of ${year}) emailed Coach ${coachLastName} at ${schoolName} about 3 weeks ago with no reply.

REQUIREMENTS:
- Open with exactly: "Coach ${coachLastName},"
- Mention ${schoolName} and the ${conference} by name
- Reference that this is a follow-up (brief — one sentence max)
- Add ONE new piece of info not in the first email (recent tournament result, a new stat, or updated film)
- Stats available: ${stats}${film ? ' | Film: ' + film : ''}
- Still interested in: "${programNotes}"
- End with a specific yes/no question to prompt a reply
- Sign off: ${playerFirst}
- Body 100-130 words — confident, not apologetic
${notes ? '- Additional context: ' + notes : ''}

SUBJECT: ${subject} — Follow Up`,

    thankyou: `Write a thank-you email from ${playerName} (${pos}, Class of ${year}) to Coach ${coachLastName} after a campus visit or phone call about ${schoolName}.

REQUIREMENTS:
- Open with exactly: "Coach ${coachLastName},"
- Name ${schoolName} and the ${conference} specifically
- Reference one specific concrete thing from the visit/call (be realistic — e.g., facility tour, pitching session discussion, academic advisor meeting)
- Reaffirm interest in the program: "${programNotes}"
- Short and warm — 80-110 words in the body
- End with clear next step the player will take
- Sign off: ${playerFirst}
${notes ? '- Additional context: ' + notes : ''}

SUBJECT: Thank You — ${playerName}, ${pos}, Class of ${year} — ${schoolName}`,

    showcase: `Write a showcase invite email from ${playerName} (${pos}, Class of ${year}) to Coach ${coachLastName} at ${schoolName}.

REQUIREMENTS:
- Open with exactly: "Coach ${coachLastName},"
- Lead with the player's single best stat from: ${stats}
- Give a specific showcase event: create a realistic name (e.g., "Perfect Game Southeast Qualifier"), a plausible date 3-6 weeks out, and a realistic city
- Include jersey number (make up a realistic number if not provided)
- Name ${schoolName} and the ${conference} — show you know the program: "${programNotes}"
- Hometown: ${hometown}${film ? ' | Film: ' + film : ''}
- Ask specifically: "Will you be attending / Can you send a staff member?"
- Sign off: ${playerFirst}
- Body 110-140 words
${notes ? '- Additional context: ' + notes : ''}

SUBJECT: Showcase Invite — ${playerName}, ${pos} — ${schoolName}`
  }

  return templates[type] || templates.first
}

export function parseEmailResult(text, profile = {}, school = {}) {
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i)
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `${profile.pos || 'Baseball Player'} — ${profile.name || 'Player'}, Class of ${profile.year || ''} — ${school.name || 'Recruiting Interest'}`
  const body = bodyMatch
    ? bodyMatch[1].trim()
    : text.replace(/^SUBJECT:.*\n?/i, '').trim()
  return { subject, body }
}

export function capEmailHistory(emails, cap = 100) {
  if (emails.length <= cap) return emails
  return [...emails]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, cap)
}
