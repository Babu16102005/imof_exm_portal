/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        imof: {
          navy: '#0B2F6B',
          blue: '#1450A0',
          saffron: '#F59E0B',
          bg: '#F6F8FC',
        },
        navy: '#0B2F6B',
        ink: '#071E45',
        paper: '#FFFDF4',
        ledger: '#E7ECF5',
        imofblue: '#1450A0',
        saffron: '#F59E0B',
        imofheading: '#050748',
        imoforange: '#EF7F1B',
        imofvermilion: '#FF3D00',
        imofcyan: '#00BCD4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Righteous', 'Fraunces', 'Poppins', 'Georgia', 'serif'],
        imof: ['Righteous', 'Fraunces', 'Poppins', 'cursive'],
        bubble: ['"Bubblegum Sans"', 'Righteous', 'cursive'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

