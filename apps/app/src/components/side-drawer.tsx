"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const STACK_OFFSET = 30;

const FADE_OFFSET = 20;

function getTransform(
  isOpen: boolean,
  hasNestedDrawer: boolean,
  fadeIn: boolean,
): string {
  if (!isOpen) {
    if (fadeIn) return `translate(${FADE_OFFSET}px, ${-FADE_OFFSET}px)`;
    return "translateX(100%)";
  }
  if (hasNestedDrawer)
    return `translate(${-STACK_OFFSET}px, ${STACK_OFFSET}px)`;
  return "translate(0, 0)";
}

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  width: string;
  zIndex: number;
  hasNestedDrawer?: boolean;
  fadeIn?: boolean;
  children: React.ReactNode;
}

export function SideDrawer({
  isOpen,
  onClose,
  width,
  zIndex,
  hasNestedDrawer = false,
  fadeIn = false,
  children,
}: SideDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !hasNestedDrawer) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, hasNestedDrawer, onClose]);

  const drawer = (
    <div
      className={cn(
        "fixed bottom-0 right-0 top-[120px] rounded-tl-xl border-l border-t border-neutral-800 bg-neutral-900 transition-all duration-300 ease-in-out",
        !isOpen && "pointer-events-none opacity-0",
      )}
      style={{
        width,
        zIndex,
        transform: getTransform(isOpen, hasNestedDrawer, fadeIn),
      }}
    >
      {children}
    </div>
  );

  if (!mounted) return null;

  return createPortal(drawer, document.body);
}
