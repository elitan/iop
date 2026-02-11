"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { orpc } from "@/lib/orpc-client";

export function PasswordSection() {
  const demoMode = useDemoMode();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const mutation = useMutation(
    orpc.settings.changePassword.mutationOptions({
      onSuccess() {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
      },
      onError(error) {
        toast.error(error.message || "Failed to update password");
      },
    }),
  );

  function handleSave() {
    if (demoMode) {
      toast.error("Password changes disabled in demo mode");
      return;
    }

    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    mutation.mutate({ currentPassword, newPassword });
  }

  return (
    <SettingCard
      title="Password"
      description="Change your login password."
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={
            demoMode || mutation.isPending || !currentPassword || !newPassword
          }
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <div className="space-y-3">
        {demoMode && (
          <DemoModeAlert text="Password changes are locked in demo mode." />
        )}
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          disabled={demoMode}
        />
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          disabled={demoMode}
        />
      </div>
    </SettingCard>
  );
}
