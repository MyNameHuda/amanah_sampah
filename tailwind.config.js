/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    // Brand colors used via @apply in custom components
    'brand-50', 'brand-100', 'brand-200', 'brand-300', 'brand-500', 'brand-600', 'brand-700',
    // Common ring colors used in @apply
    'ring-brand-200', 'ring-brand-500',
    'ring-amber-200', 'ring-red-200', 'ring-green-200',
    'bg-amber-100', 'bg-amber-50', 'bg-red-50', 'bg-red-100', 'bg-green-50', 'bg-green-100',
    'bg-blue-50', 'bg-blue-100', 'bg-slate-50', 'bg-slate-100', 'bg-slate-200', 'bg-slate-300',
    'text-amber-500', 'text-amber-700', 'text-amber-800', 'text-amber-900',
    'text-red-500', 'text-red-600', 'text-red-700', 'text-red-800',
    'text-green-600', 'text-green-700', 'text-green-800',
    'text-blue-500', 'text-blue-600', 'text-blue-700', 'text-blue-800',
    'text-violet-700', 'text-rose-700', 'text-emerald-700',
    'border-amber-200', 'border-red-200', 'border-green-200', 'border-blue-200', 'border-slate-200', 'border-slate-300',
    // Reduced-motion utilities (used inline, need safelist)
    'motion-reduce:hidden', 'motion-reduce:animate-none',
    // Screen-reader utilities
    'sr-only', 'focus:not-sr-only',
    // w-4.5 used in feature icons (new in Tailwind 3.4+ but worth ensuring)
    'w-4.5', 'h-4.5',
    // Decorative blur shapes on login right panel
    'bg-brand-200/40', 'bg-emerald-200/30', 'bg-teal-100/40',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(20px, -15px) scale(1.05)' },
          '66%':      { transform: 'translate(-10px, 20px) scale(0.95)' },
        },
        'drop-in': {
          '0%':   { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-from-right': {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'zoom-fade-in': {
          '0%':   { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'reveal-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '60%':  { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { 'box-shadow': '0 0 0 0 rgb(187 247 208 / 0)' },
          '50%':      { 'box-shadow': '0 0 0 8px rgb(187 247 208 / 0.4)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-in': 'slide-in 0.2s ease-out',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        'drift': 'drift 20s ease-in-out infinite',
        'drop-in': 'drop-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-from-right': 'slide-from-right 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'zoom-fade-in': 'zoom-fade-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'reveal-up': 'reveal-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
