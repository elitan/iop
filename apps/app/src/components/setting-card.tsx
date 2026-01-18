"use client";

import { ExternalLink } from "lucide-react";

/**
 * SettingCard - A card component for settings pages.
 *
 * Design pattern inspired by Vercel's settings UI:
 *
 * Structure:
 * ┌─────────────────────────────────────────────────────────┐
 * │ Title                                    [headerAction] │
 * │ Description explaining what this setting does           │
 * │                                                         │
 * │ Form content (always visible, no edit mode toggle)      │
 * │                                                         │
 * ├─────────────────────────────────────────────────────────┤
 * │ Learn more about [Topic] ↗          [Save] / [Action]   │
 * └─────────────────────────────────────────────────────────┘
 *
 * Guidelines:
 * - One setting (or small related group) per card
 * - Always show form fields, no edit/view mode toggle
 * - Each card has its own Save button
 * - Description should explain what the setting does
 * - Use learnMoreUrl for external documentation links
 * - Use variant="danger" for destructive actions (delete, etc.)
 *
 * Example usage:
 * ```tsx
 * <SettingCard
 *   title="Request Timeout"
 *   description="Maximum time allowed for HTTP requests before returning 504."
 *   learnMoreUrl="https://docs.example.com/timeouts"
 *   learnMoreText="Learn more about Request Timeout"
 *   footerRight={<Button onClick={handleSave}>Save</Button>}
 * >
 *   <Select value={timeout} onValueChange={setTimeout}>...</Select>
 * </SettingCard>
 * ```
 */

interface SettingCardProps {
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  footer?: React.ReactNode;
  learnMoreUrl?: string;
  learnMoreText?: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}

export function SettingCard({
  title,
  description,
  headerAction,
  footerLeft,
  footerRight,
  footer,
  learnMoreUrl,
  learnMoreText,
  variant = "default",
  children,
}: SettingCardProps) {
  const rightContent = footerRight ?? footer;
  const isDanger = variant === "danger";

  const hasFooter = footerLeft || rightContent || learnMoreUrl;

  return (
    <div
      className={`rounded-lg border ${isDanger ? "border-red-900/50" : "border-neutral-800"} bg-neutral-900`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2
              className={`text-xl font-semibold ${isDanger ? "text-red-400" : "text-white"}`}
            >
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm text-neutral-400">{description}</p>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {hasFooter && (
        <div className="flex items-center justify-between border-t border-neutral-800 px-6 py-3">
          {learnMoreUrl ? (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300"
            >
              {learnMoreText || "Learn more"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : footerLeft ? (
            <div>{footerLeft}</div>
          ) : (
            <div />
          )}
          {rightContent && <div>{rightContent}</div>}
        </div>
      )}
    </div>
  );
}
