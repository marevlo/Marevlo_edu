/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "var(--color-primary)",
                secondary: "var(--color-secondary)",
                accent: "var(--color-accent)",
                "app-bg": "var(--color-app-bg)",
                "surface": "var(--color-surface)",
                "surface-hover": "var(--color-surface-hover)",
                "primary-text": "var(--color-primary-text)",
                "muted-text": "var(--color-muted-text)",
                "border-color": "var(--color-border)",
                "card-bg": "var(--color-card-bg)",
                "input-bg": "var(--color-input-bg)",
            },
            animation: {
                blob: "blob 7s infinite",
                float: "float 6s ease-in-out infinite",
                marquee: "marquee 25s linear infinite",
            },
            keyframes: {
                blob: {
                    "0%": { transform: "translate(0px, 0px) scale(1)" },
                    "33%": { transform: "translate(30px, -50px) scale(1.1)" },
                    "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
                    "100%": { transform: "translate(0px, 0px) scale(1)" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-20px)" },
                },
                marquee: {
                    "0%": { transform: "translateX(0%)" },
                    "100%": { transform: "translateX(-100%)" },
                },
            },
        },
    },
    plugins: [],
}
