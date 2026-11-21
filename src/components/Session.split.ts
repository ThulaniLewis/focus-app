/** Split "dishes away, wash the second load; bin the rest" into separate jobs. */
export function splitLeftovers(text: string): string[] {
  return text
    .split(/\n|;|,|\.\s|\bthen\b|\band also\b/i)
    .map((s) => s.replace(/^\s*(and|also|i need to|need to|still need to|i still need to)\s+/i, '').trim())
    .map((s) => s.replace(/\.$/, ''))
    .filter((s) => s.length > 1)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

