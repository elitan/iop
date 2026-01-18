import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { Steps } from "@/components/steps";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <Steps />
      <Install />
      <Footer />
    </main>
  );
}
