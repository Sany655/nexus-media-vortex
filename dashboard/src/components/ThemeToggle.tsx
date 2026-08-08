"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors shadow-sm"
      title="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun size={18} className="text-emerald-400" />
      ) : (
        <Moon size={18} className="text-emerald-600" />
      )}
    </button>
  );
}
