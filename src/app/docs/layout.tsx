import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { DocsNav } from "./_components/docs-nav";
import { DocsToc } from "./_components/docs-toc";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <BreadcrumbHeader items={[{ label: "Docs" }]} />
      <div className="container mx-auto px-4">
        <div className="flex gap-8 py-8">
          <aside className="w-56 shrink-0">
            <div className="sticky top-8">
              <DocsNav />
            </div>
          </aside>

          <main className="min-w-0 flex-1 max-w-2xl">
            <article className="prose prose-invert prose-headings:text-neutral-100 prose-headings:font-semibold prose-p:text-neutral-300 prose-strong:text-neutral-100 prose-th:text-neutral-100 prose-td:text-neutral-300 prose-pre:m-0 prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0 max-w-none">
              {children}
            </article>
          </main>

          <aside className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-8">
              <DocsToc />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
