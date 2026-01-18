import { Suspense } from "react";
import { GitHubSection } from "../_components/github-section";

export default function GitHubPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="text-neutral-400">Loading...</div>}>
        <GitHubSection />
      </Suspense>
    </div>
  );
}
