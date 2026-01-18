import type { ReactNode } from "react";

interface HeaderProps {
  children: ReactNode;
}

export function Header({ children }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800/50 bg-neutral-900/70 backdrop-blur-md">
      {children}
    </header>
  );
}
