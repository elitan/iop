"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.setupComplete) {
          window.location.href = "/";
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError("");
    setConfirmError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password.length < 4) {
      setPasswordError("Password must be at least 4 characters");
      return;
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setPasswordError(data?.error || "Setup failed");
      setLoading(false);
      return;
    }

    window.location.href = "/login";
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Card className="border-neutral-800 bg-neutral-900">
          <CardHeader className="text-center">
            <CardTitle className="text-lg font-medium text-neutral-100">
              Setup Frost
            </CardTitle>
            <p className="text-sm text-neutral-400">
              Create your admin password
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-neutral-300">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoFocus
                  minLength={4}
                  className="border-neutral-700 bg-neutral-800 text-neutral-100"
                />
                {passwordError && (
                  <p className="text-sm text-red-400">{passwordError}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword" className="text-neutral-300">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={4}
                  className="border-neutral-700 bg-neutral-800 text-neutral-100"
                />
                {confirmError && (
                  <p className="text-sm text-red-400">{confirmError}</p>
                )}
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Setting up
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
