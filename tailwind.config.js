/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        gradient: "gradient 6s ease infinite",
      },
      keyframes: {
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          colors: {
          'primary-dark': '#0B0D18', // Deep Charcoal
          'secondary-accent-1': '#7228b0ff', // Vibrant Purple from logo
          'secondary-accent-2': '#F97316', // Vibrant Orange from logo
          'light-slate': '#E2E8F0', // Off-white
          'slate-gray': '#94A3B8', // A lighter gray for subtext
        },
        },
      },
    },
  },
  plugins: [],
};
