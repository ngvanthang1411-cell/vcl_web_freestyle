/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every colour resolves through a CSS variable declared in src/theme.css,
      // so the palette has exactly one source of truth.
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--color-surface-overlay) / <alpha-value>)',
          high: 'rgb(var(--color-surface-high) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--color-content) / <alpha-value>)',
          muted: 'rgb(var(--color-content-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-content-subtle) / <alpha-value>)',
          inverse: 'rgb(var(--color-content-inverse) / <alpha-value>)',
        },
        // The sunset sweep: orange (from the logo) → pink → violet.
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          light: 'rgb(var(--color-accent-light) / <alpha-value>)',
          lighter: 'rgb(var(--color-accent-lighter) / <alpha-value>)',
          muted: 'rgb(var(--color-accent-muted) / <alpha-value>)',
          deep: 'rgb(var(--color-accent-deep) / <alpha-value>)',
          deepest: 'rgb(var(--color-accent-deepest) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          light: 'rgb(var(--color-secondary-light) / <alpha-value>)',
          lighter: 'rgb(var(--color-secondary-lighter) / <alpha-value>)',
          muted: 'rgb(var(--color-secondary-muted) / <alpha-value>)',
          deep: 'rgb(var(--color-secondary-deep) / <alpha-value>)',
          deepest: 'rgb(var(--color-secondary-deepest) / <alpha-value>)',
        },
        tertiary: {
          DEFAULT: 'rgb(var(--color-tertiary) / <alpha-value>)',
          light: 'rgb(var(--color-tertiary-light) / <alpha-value>)',
          lighter: 'rgb(var(--color-tertiary-lighter) / <alpha-value>)',
          muted: 'rgb(var(--color-tertiary-muted) / <alpha-value>)',
          deep: 'rgb(var(--color-tertiary-deep) / <alpha-value>)',
          deepest: 'rgb(var(--color-tertiary-deepest) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
      },
      boxShadow: {
        // Soft, low-spread shadows — depth comes from hairlines first.
        soft: '0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px rgb(0 0 0 / 0.28)',
        lift: '0 2px 4px rgb(0 0 0 / 0.4), 0 16px 40px rgb(0 0 0 / 0.36)',
      },
      letterSpacing: {
        kicker: '0.18em',
        wide2: '0.08em',
      },
      keyframes: {
        'word-rise': {
          '0%': {
            opacity: '0',
            transform: 'translateY(8px) scale(0.97)',
            filter: 'blur(4px)',
          },
          '60%': {
            opacity: '1',
            filter: 'blur(0px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
            filter: 'blur(0px)',
          },
        },
        'word-hit': {
          '0%': { transform: 'scale(1)' },
          '28%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        'pop-ring': {
          '0%': { opacity: '0.9', transform: 'scale(0.25)' },
          '100%': { opacity: '0', transform: 'scale(1.75)' },
        },
        'pop-ray': {
          '0%': { opacity: '1', transform: 'translateY(0) scaleY(0.4)' },
          '35%': { opacity: '0.95', transform: 'translateY(-14px) scaleY(1)' },
          '100%': { opacity: '0', transform: 'translateY(-36px) scaleY(0.25)' },
        },
        'screen-enter': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'rec-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(1.4)' },
        },
        'eq-bar': {
          '0%, 100%': { transform: 'scaleY(0.28)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'word-rise': 'word-rise 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'word-hit': 'word-hit 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-ring': 'pop-ring 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pop-ray': 'pop-ray 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'screen-enter': 'screen-enter 340ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-up': 'fade-up 380ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'rec-pulse': 'rec-pulse 1.4s ease-in-out infinite',
        'eq-bar': 'eq-bar 680ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
