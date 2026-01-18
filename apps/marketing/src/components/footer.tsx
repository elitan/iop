import { FrostLogo } from "./frost-logo";

export function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <FrostLogo size={24} />
          <span className="text-muted-foreground">
            Deploy Docker apps. Simply.
          </span>
        </div>

        <div className="flex gap-6 text-muted-foreground">
          <a
            href="https://github.com/elitan/frost"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://github.com/elitan/frost#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  );
}
