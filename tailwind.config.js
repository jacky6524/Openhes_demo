/**
 * Tailwind theme = utility-class mirror of src/tokens.ts.
 * src/tokens.ts is the canonical source for runtime/JS usage (charts, map fills).
 * Keep these two in sync — same hex values, same names.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // neutral (warm rose)
        bg: '#F5EDEE',
        surface: '#FFFFFF',
        inset: '#F0E7E8',
        border: '#E7DBDD',
        divider: '#EEE4E5',
        // text
        ink: '#2A2125',
        'ink-sub': '#6B5E62',
        'ink-mut': '#A89BA0',
        // brand (rose) — brand / primary action / selected / link ONLY
        brand: {
          DEFAULT: '#C23B52',
          deep: '#A22C40',
          soft: '#FAE6EB',
        },
        // status — foreground tones (use *-bg / *-bd via tokens.ts for fills/borders)
        normal: '#12936A',
        'normal-bg': '#E0F4ED',
        'normal-bd': '#AEDFCE',
        warning: '#E08A0B',
        'warning-bg': '#FCEFD6',
        'warning-bd': '#F2D69A',
        danger: '#DB3B36',
        'danger-bg': '#FBE0DF',
        'danger-bd': '#F2B5B2',
        critical: '#A82A30',
        'critical-bg': '#F6D6D6',
        'critical-bd': '#E5AEAE',
        info: '#2F6BED',
        'info-bg': '#E7F0FE',
        'info-bd': '#BBD4F6',
        // magnitude / trend — single-hue purple scale
        mag: {
          50: '#F1EFFC',
          100: '#D8D2F4',
          200: '#B7ADE9',
          300: '#8E80DC',
          400: '#6051BE',
          500: '#3F3490',
        },
      },
      boxShadow: {
        // floating card: faint double-layer (NOT heavy borders)
        card: '0 1px 2px rgba(42,33,37,.05), 0 6px 18px rgba(42,33,37,.08)',
        drawer: '-8px 0 28px rgba(42,33,37,.12)',
      },
      borderRadius: {
        card: '11px',
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans TC"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
