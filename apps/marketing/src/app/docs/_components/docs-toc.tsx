"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isClickingRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers rescan on navigation
  useEffect(() => {
    setHeadings([]);
    setActiveId("");

    function scanHeadings() {
      const article = document.querySelector("article");
      if (!article) return;

      const elements = article.querySelectorAll("h2, h3");
      if (elements.length === 0) return;

      const items: TocItem[] = Array.from(elements)
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          text: el.textContent || "",
          level: el.tagName === "H2" ? 2 : 3,
        }));

      setHeadings(items);

      if (items.length > 0) {
        setActiveId(items[0].id);
      }

      observerRef.current?.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (isClickingRef.current) return;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id);
              break;
            }
          }
        },
        { rootMargin: "-80px 0px -60% 0px" },
      );

      for (const el of elements) {
        if (el.id) observerRef.current?.observe(el);
      }
    }

    const timeout = setTimeout(scanHeadings, 50);

    return () => {
      clearTimeout(timeout);
      observerRef.current?.disconnect();
    };
  }, [pathname]);

  function handleClick(id: string) {
    isClickingRef.current = true;
    setActiveId(id);
    setTimeout(() => {
      isClickingRef.current = false;
    }, 100);
  }

  if (headings.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-neutral-100 mb-3">
        On this page
      </h4>
      <nav className="space-y-1 border-l border-neutral-800">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            onClick={() => handleClick(heading.id)}
            className={cn(
              "block text-sm py-1 transition-colors border-l-2 -ml-px pl-3",
              heading.level === 3 && "pl-6",
              activeId === heading.id
                ? "text-foreground border-foreground"
                : "text-muted-foreground hover:text-foreground/80 border-transparent",
            )}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
