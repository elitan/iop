import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { MonitoringSection } from "@/components/monitoring-section";
import { ProductShowcase } from "@/components/product-showcase";
import { SSLSection } from "@/components/ssl-section";
import { Steps } from "@/components/steps";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProductShowcase />
      <Features />
      <SSLSection />
      <MonitoringSection />
      <Steps />
      <Install />
      <Footer />
    </main>
  );
}
