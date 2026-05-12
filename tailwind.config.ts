import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // All tokens point to CSS variables defined in globals.css. The
        // `<alpha-value>` placeholder lets opacity modifiers (bg-bg/80,
        // text-ink-muted/50, etc.) keep working — Tailwind substitutes
        // the current alpha into the rgb() expression. Theme is switched
        // by toggling the .light class on <html>.
        bg: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          raised: 'rgb(var(--bg-raised) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          subtle: 'rgb(var(--line-subtle) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          dim: 'rgb(var(--ink-dim) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          glow: 'rgb(var(--accent-glow) / <alpha-value>)',
          dim: 'rgb(var(--accent-dim) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        flame: 'rgb(var(--flame) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Noto Sans TC"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 400ms ease-out',
        'slide-up': 'slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'flame-flicker': 'flameFlicker 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 20px rgba(59,130,246,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(59,130,246,0.6)' },
        },
        flameFlicker: {
          '0%,100%': { transform: 'scale(1) rotate(-2deg)', opacity: '1' },
          '50%': { transform: 'scale(1.08) rotate(2deg)', opacity: '0.92' },
        },
      },
      backgroundImage: {
        'grid-pattern':
          "linear-gradient(rgba(63,63,70,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,70,0.15) 1px, transparent 1px)",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backgroundSize: { 'grid-pattern': '40px 40px' },
      // h-13 / w-13 / p-13 are referenced throughout (Button lg, confirm
      // CTA, questionnaire submit). Tailwind has no 13 in its default
      // spacing scale, so without this extension every "lg" button was
      // silently collapsing to its natural height.
      spacing: {
        13: '3.25rem',
      },
    },
  },
  plugins: [],
};
export default config;
