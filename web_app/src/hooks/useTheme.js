import { useState, useEffect } from "react";

// ─── useTheme ────────────────────────────────────────────────────────────────
// Reads theme from localStorage on first load, applies it to <html>, and
// exposes a toggle function. Any component can import this hook and call
// toggleTheme() — it always stays in sync because it writes to the DOM directly.
//
// Dark  = no data-theme attribute (tokens.css :root defaults to dark)
// Light = data-theme="light"      (tokens.css [data-theme="light"] overrides)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "dfir-theme";

export function useTheme() {
    const [theme, setTheme] = useState(() => {
        // Read from localStorage on first render, default to dark
        return localStorage.getItem(STORAGE_KEY) || "dark";
    });

    useEffect(() => {
        // Apply to <html> whenever theme changes
        if (theme === "light") {
            document.documentElement.setAttribute("data-theme", "light");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
        // Persist to localStorage
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === "dark" ? "light" : "dark"));
    };

    return { theme, toggleTheme, isDark: theme === "dark" };
}