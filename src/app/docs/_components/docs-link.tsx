import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface DocsLinkProps {
  href?: string;
  children: React.ReactNode;
}

export function DocsLink({ href, children }: DocsLinkProps) {
  if (!href) {
    return <span>{children}</span>;
  }

  const isExternal = href.startsWith("http://") || href.startsWith("https://");

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100"
      >
        {children}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100"
    >
      {children}
    </Link>
  );
}
