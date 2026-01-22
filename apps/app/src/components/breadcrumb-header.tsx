import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FrostLogo } from "./frost-logo";
import { HeaderNav } from "./header-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DropdownItem {
  type: "dropdown";
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}

type BreadcrumbEntry = BreadcrumbItem | DropdownItem;

interface BreadcrumbHeaderProps {
  items: BreadcrumbEntry[];
  actions?: ReactNode;
}

function isDropdownItem(item: BreadcrumbEntry): item is DropdownItem {
  return "type" in item && item.type === "dropdown";
}

export function BreadcrumbHeader({ items, actions }: BreadcrumbHeaderProps) {
  return (
    <div className="border-b border-neutral-800">
      <div className="container mx-auto flex h-14 items-center gap-2 px-4">
        <Link
          href="/"
          className="text-neutral-100 transition-colors hover:text-neutral-300"
        >
          <FrostLogo />
        </Link>
        {items.map((item, index) => (
          <div
            key={isDropdownItem(item) ? item.value : item.label}
            className="flex items-center gap-2.5"
          >
            <span className="text-neutral-600">/</span>
            {isDropdownItem(item) ? (
              <Select value={item.value} onValueChange={item.onChange}>
                <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-sm text-neutral-100 shadow-none focus:ring-0">
                  <SelectValue />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </SelectTrigger>
                <SelectContent>
                  {item.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : item.href ? (
              <Link
                href={item.href}
                className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-sm text-neutral-100">{item.label}</span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4">
          {actions}
          <HeaderNav />
        </div>
      </div>
    </div>
  );
}
