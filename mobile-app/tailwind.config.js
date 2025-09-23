/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './public/index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f1',
          100: '#ffe0e0',
          200: '#ffbdbd',
          300: '#ff8a8a',
          400: '#ff5858',
          500: '#ff4d4d',
          600: '#e63f3f',
          700: '#c92e2e',
          800: '#a11f1f',
          900: '#7a1a1a',
        },
      },
      boxShadow: {
        soft: '0 8px 24px rgba(0,0,0,0.08)'
      }
    },
  },
  plugins: [],
};
