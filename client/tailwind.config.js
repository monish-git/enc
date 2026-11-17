/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['"MS Sans Serif"', '"Microsoft Sans Serif"', 'Tahoma', 'Verdana', '"DejaVu Sans"', 'sans-serif'],
        term: ['VT323', '"Courier New"', 'monospace'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
      colors: {
        desktop: 'var(--desktop)',
        face: 'var(--face)',
        navy: 'var(--title)',
        accent: 'var(--accent)',
        term: 'var(--term-fg)',
      },
    },
  },
  plugins: [],
};
