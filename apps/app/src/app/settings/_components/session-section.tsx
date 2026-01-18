"use client";

import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";

export function SessionSection() {
  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <SettingCard
      title="Session"
      description="You are currently signed in. Sign out to end your session and return to the login page."
      footerRight={
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      }
    >
      <p className="text-sm text-neutral-400">
        Signing out will clear your session. You'll need to enter the install
        password to sign back in.
      </p>
    </SettingCard>
  );
}
