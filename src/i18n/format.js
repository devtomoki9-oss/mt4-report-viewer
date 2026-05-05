import i18n from './index'

const baseLang = (lang) => (lang || i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]

// BCP47 codes used by Intl. Map our internal language codes to richer locales
// when they affect formatting (e.g. ja → ja-JP for proper era and digit display).
const INTL_LOCALE = {
  ja: 'ja-JP',
  en: 'en-US',
}

function intlLocale(lang) {
  const base = baseLang(lang)
  return INTL_LOCALE[base] ?? base
}

// ── Numbers ──────────────────────────────────────────────────────────────

// General-purpose number with up to `maxDigits` decimals, grouping enabled.
export function formatNumber(value, { lang, minDigits = 0, maxDigits = 2 } = {}) {
  if (value == null || !isFinite(value)) return '—'
  return new Intl.NumberFormat(intlLocale(lang), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(value)
}

// Integer count (e.g. trade count). No decimals, with grouping.
export function formatCount(value, { lang } = {}) {
  if (value == null) return '—'
  return new Intl.NumberFormat(intlLocale(lang)).format(Math.trunc(value))
}

// Money-like number: groups when |value| >= 1000, otherwise plain 2-decimal.
// Matches the existing `fmt()` shape used across StatCards.
export function formatMoney(value, { lang } = {}) {
  if (value == null || !isFinite(value)) return '—'
  const abs = Math.abs(value)
  return abs >= 1000
    ? new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 2 }).format(abs)
    : abs.toFixed(2)
}

// Common broker variants → ISO 4217 codes.
// Brokers sometimes report currencies as symbols ("$", "¥") or English words
// ("Dollar", "U.S. Dollar"); normalize them to standard codes for display.
const CURRENCY_ALIASES = {
  '$':            'USD',
  'us$':          'USD',
  'usd':          'USD',
  'dollar':       'USD',
  'dollars':      'USD',
  'usdollar':     'USD',
  'us dollar':    'USD',
  'u.s. dollar':  'USD',
  'usdollars':    'USD',
  '¥':            'JPY',
  'jpy':          'JPY',
  'yen':          'JPY',
  'jp¥':          'JPY',
  '€':            'EUR',
  'eur':          'EUR',
  'euro':         'EUR',
  '£':            'GBP',
  'gbp':          'GBP',
  'pound':        'GBP',
  'a$':           'AUD',
  'aud':          'AUD',
  'c$':           'CAD',
  'cad':          'CAD',
  'chf':          'CHF',
  'nzd':          'NZD',
}

export function normalizeCurrency(currency) {
  if (!currency) return ''
  const key = String(currency).trim().toLowerCase()
  return CURRENCY_ALIASES[key] ?? String(currency).trim().toUpperCase()
}

// Money + currency suffix. Currency code is rendered as the trailing symbol
// the broker reports (USD, JPY, etc). We keep it as a plain suffix rather than
// `Intl.NumberFormat({ style: 'currency' })` to preserve the existing layout
// (digits first, then a literal currency token).
export function formatMoneyWithCurrency(value, currency, { lang, maxDigits = 2 } = {}) {
  const num = formatNumber(value ?? 0, { lang, maxDigits })
  const code = normalizeCurrency(currency)
  return code ? `${num} ${code}` : num
}

// Signed money: prepends "+" for non-negative values, "-" for negative,
// with `formatMoney` for the magnitude.
export function formatSignedMoney(value, { lang } = {}) {
  if (value == null || !isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : '-'
  return sign + formatMoney(value, { lang })
}

export function formatPercent(value, { lang, digits = 1 } = {}) {
  if (value == null || !isFinite(value)) return '—'
  return `${formatNumber(value, { lang, minDigits: digits, maxDigits: digits })}%`
}

// ── Dates ────────────────────────────────────────────────────────────────

function toDateLike(value) {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  // MT4 timestamps are "YYYY-MM-DD HH:mm:ss" or "YYYY.MM.DD HH:mm:ss" — Date can
  // parse the dashed form once we replace the space with 'T'.
  if (typeof value === 'string') {
    const normalized = value.replace(' ', 'T').replace(/\./g, '-')
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export function formatTime(value, { lang, withSeconds = true } = {}) {
  const d = toDateLike(value)
  if (!d) return ''
  return d.toLocaleTimeString(intlLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

// "YYYY-MM-DD" for date inputs, range labels, and storage keys.
// Intentionally locale-agnostic.
export function formatIsoDate(value) {
  const d = toDateLike(value)
  if (!d) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Display-friendly short date (e.g. "May 3, 2024" / "2024年5月3日")
export function formatDate(value, { lang } = {}) {
  const d = toDateLike(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: 'medium' }).format(d)
}

export function formatDateTimeShort(value, { lang } = {}) {
  const d = toDateLike(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(lang), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

// Localized month name (used when constructing month-year labels).
export function formatMonthName(date, { lang } = {}) {
  const d = toDateLike(date) ?? date
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(lang), { month: 'long' }).format(d)
}
