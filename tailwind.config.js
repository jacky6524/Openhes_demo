/**
 * Tailwind theme = utility-class mirror of src/tokens.ts.
 * src/tokens.ts is the canonical source for runtime/JS usage (charts, map fills).
 * Keep these two in sync — same hex values, same names.
 *
 * ⚠ 兩份都已對齊前端正式包 openhes-front/shared/assets/color.css。
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // neutral — 前端 --surface-* / --border-*
        bg: '#F9FAFB',
        // 設計稿的整頁底色與頂欄／側欄底色（取自業主提供的「背景顏色設定參考」）
        page: '#F5EDEE',
        chrome: '#FAF6F6',
        surface: '#FFFFFF',
        inset: '#F3F4F6',
        border: '#E5E7EB',
        'border-strong': '#D1D5DB',
        'card-border': '#E7DBDD',
        'card-border-alert': '#C74365',
        divider: '#F3F4F6',
        // text — 前端 --text-*
        ink: '#1E2939',
        'ink-sub': '#4A5565',
        'ink-mut': '#6A7282',
        'ink-fai': '#99A1AF',
        // brand (HES red) — 品牌 / 主要動作 / 選取 / 連結
        brand: {
          DEFAULT: '#C10007', // --brand-700 / --text-theme
          solid: '#E7000B', // --brand-600 / --link-filled
          deep: '#9F0712', // --brand-800
          soft: '#FEF2F2', // --brand-50 / --surface-theme
          'soft-hover': '#FFE2E2', // --brand-100
        },
        // status — 前端 --status-*-emphasis / --status-*-border
        normal: '#00BC7D',
        'normal-bg': '#ECFDF5',
        'normal-bd': '#BBF7D0',
        warning: '#FFB900',
        'warning-bg': '#FFFBEB',
        'warning-bd': '#FDE68A',
        danger: '#FB2C36',
        'danger-bg': '#FEF2F2',
        'danger-bd': '#FECACA',
        critical: '#C10007',
        'critical-bg': '#FFE2E2',
        'critical-bd': '#FFC9C9',
        info: '#2B7FFF',
        'info-bg': '#EFF6FF',
        'info-bd': '#BAE6FD',
        // 系統總覽 ALT 區塊 — tokens.ts overview.alt
        alt: '#0E8FA8',
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
        // 前端 --boxshadow-cardS / cardM / cardL
        card: '0px 2px 4px -1px #9F071212, 0px 0px 1px 0px #82181A06',
        'card-hover': '0px 10px 12px -2px #9F071212, 0px 4px 6px -1px #00000002, 0px 0px 1px 0px #82181A06',
        drawer: '-8px 20px 24px -2px #9F071212, 0px 4px 8px -1px #00000004, 0px 0px 1px 0px #82181A06',
      },
      borderRadius: {
        // 前端 --radius-*；card 對應 .metric-card / .panel 的 16px
        card: '16px',
        panel: '12px',
        field: '8px',
      },
      fontFamily: {
        // 前端 font.css：* { font-family: 'Rubik', 'Noto Sans TC', sans-serif }
        sans: ['Rubik', '"Noto Sans TC"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        // 前端 .new-dashboard 頁底
        dashboard:
          'radial-gradient(circle at 8% 8%, rgba(173, 49, 85, 0.08), transparent 28%), linear-gradient(180deg, #F8F0F2 0%, #F6EEEE 100%)',
      },
    },
  },
  plugins: [],
}
