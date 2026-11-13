import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TaglineReveal } from "@/components/landing/tagline-reveal";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Categories } from "@/components/landing/categories";
import { Formats } from "@/components/landing/formats";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#000000] text-zinc-900 dark:text-zinc-100">
      <Navbar />
      <main id="main-content" className="flex-1">
        <Hero />
        <TaglineReveal />
        <HowItWorks />
        <Features />
        <Categories />
        <Formats />
        <Pricing />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
