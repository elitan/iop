import { GeneralSection } from "./_components/general-section";
import { SessionSection } from "./_components/session-section";
import { SystemSection } from "./_components/system-section";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <GeneralSection />
      <SystemSection />
      <SessionSection />
    </div>
  );
}
