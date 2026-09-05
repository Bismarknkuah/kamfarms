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
          500: '#6B4A2F',
          700: '#4A3220',
        },
        ink: {
          900: '#1C1B17',
          700: '#39372F',
          500: '#68655A',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
