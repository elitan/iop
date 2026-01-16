import Link from "next/link";

const navigation = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Installation", href: "/docs/installation" },
    ],
  },
  {
    title: "Concepts",
    items: [
      { title: "Projects", href: "/docs/concepts/projects" },
      { title: "Services", href: "/docs/concepts/services" },
      { title: "Deployments", href: "/docs/concepts/deployments" },
      { title: "Domains", href: "/docs/concepts/domains" },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Environment Variables", href: "/docs/guides/env-vars" },
      { title: "Custom Domains", href: "/docs/guides/custom-domains" },
    ],
  },
  {
    title: "API",
    items: [{ title: "API Reference", href: "/api/docs" }],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-border p-6 sticky top-0 h-screen overflow-y-auto">
        <Link href="/" className="text-lg font-semibold mb-8 block">
          Frost
        </Link>
        <nav className="space-y-6">
          {navigation.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block text-sm py-1 text-foreground/80 hover:text-foreground transition-colors"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8 max-w-3xl">
        <article className="prose prose-invert prose-headings:text-foreground prose-p:text-foreground/80 prose-a:text-accent prose-strong:text-foreground prose-code:text-foreground prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-secondary prose-pre:border prose-pre:border-border max-w-none">
          {children}
        </article>
      </main>
    </div>
  );
}
