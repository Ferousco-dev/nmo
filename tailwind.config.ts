import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark Premium: Zinc base + Electric Blue accent
        bg: {
          DEFAULT: '#09090b',     // zinc-950
          raised: '#18181b',      // zinc-900
          card: '#1f1f23',
          hover: '#27272a',       // zinc-800
        },
        line: {
          DEFAULT: '#27272a',     // zinc-800
          subtle: '#1f1f23',
          strong: '#3f3f46',      // zinc-700
        },
        ink: {
          DEFAULT: '#fafafa',     // zinc-50
          muted: '#a1a1aa',       // zinc-400
          dim: '#71717a',         // zinc-500
          faint: '#52525b',       // zinc-600
        },
        accent: {
          DEFAULT: '#3b82f6',     // electric blue
          hover: '#2563eb',
          glow: '#60a5fa',
          dim: '#1e3a8a',
        },
        success: '#10b981',
        warn: '#f59e0b',
        danger: '#ef4444',
        flame: '#f97316',
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
    },
  },
  plugins: [],
};
export default config;
