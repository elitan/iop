import { ComingSoon } from "@/components/coming-soon";
import { DeployAnything } from "@/components/deploy-anything";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { OpenSourceSection } from "@/components/open-source-section";
import { TechScroll } from "@/components/tech-scroll";
import { TheShift } from "@/components/the-shift";
import { WhatYouGet } from "@/components/what-you-get";

export default function Home() {
  return (
    <main>
      <Hero />
      <TheShift />
      <DeployAnything />
      <TechScroll />
      <WhatYouGet />
      <OpenSourceSection />
      <ComingSoon />
      <Install />
      <Footer />
    </main>
  );
}
