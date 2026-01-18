"use client";

import { Github } from "lucide-react";
import { useEffect, useState } from "react";
import { FrostLogo } from "./frost-logo";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("https://api.github.com/repos/elitan/frost")
      .then((res) => res.json())
      .then((data) => {
        if (data.stargazers_count) {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <FrostLogo size={28} />
          <span className="font-semibold text-lg">Frost</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 select-none">
          <a
            href="#features"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </a>
          <a
            href="#install"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Install
          </a>
        </nav>

        <a
          href="https://github.com/elitan/frost"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/50 hover:border-border bg-card/30 hover:bg-card/50 transition-all text-sm select-none"
        >
          <Github size={16} className="text-muted-foreground" />
          {stars !== null && (
            <span className="text-muted-foreground font-mono text-xs">
              {stars}
            </span>
          )}
        </a>
      </div>
    </header>
  );
}
