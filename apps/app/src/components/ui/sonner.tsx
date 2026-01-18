"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-neutral-900 group-[.toaster]:text-neutral-100 group-[.toaster]:border-neutral-800 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-neutral-400",
          actionButton: "group-[.toast]:bg-blue-500 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-neutral-800 group-[.toast]:text-neutral-400",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
