/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { primary: { DEFAULT: '#0f766e', dark: '#0b5e57', light: '#e6f4f2' } },
    },
  },
  plugins: [],
};
