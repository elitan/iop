import { SslSection } from "../_components/ssl-section";
import { WildcardSection } from "../_components/wildcard-section";

export default function DomainPage() {
  return (
    <div className="space-y-6">
      <SslSection />
      <WildcardSection />
    </div>
  );
}
