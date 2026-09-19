import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Grounded in Pectra Rice's own supply chain, not a generic palette:
        // deep paddy green (the crop before harvest), husk gold (the grain
        // itself), and a warm unpolished-rice cream background.
        paddy: {
          50: '#EEF3EC',
          100: '#D6E3D2',
          300: '#8FAE85',
          500: '#3F6B3B',
          700: '#264A28',
          900: '#132C1A',
        },
        husk: {
          100: '#F6E9C8',
          300: '#E7C978',
          500: '#C9982F',
          700: '#9A7220',
        },
        rice: {
          50: '#FBF8F2',
          100: '#F4EEE0',
        },
        soil: {
          // Warm walnut surfaces added for the corporate redesign - the
          // photographic, mahogany-and-cream language, grounded in the
          // paddy palette that was already here rather than replacing it.
          100: '#F1E6D8',
          300: '#C9A98A',
          500: '#6B4A2F',
          700: '#4A3220',
        },
        ink: {
          900: '#1C1B17',
          700: '#39372F',
          500: '#68655A',
        },
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(18px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slow-zoom': { '0%': { transform: 'scale(1)' }, '100%': { transform: 'scale(1.08)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slow-zoom': 'slow-zoom 20s ease-out forwards',
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'ui-serif', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
