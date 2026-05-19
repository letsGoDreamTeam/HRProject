import LandingCompare from "@/components/landing/LandingCompare";
import LandingContact from "@/components/landing/LandingContact";
import LandingCta from "@/components/landing/LandingCta";
import LandingFaq from "@/components/landing/LandingFaq";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingHero from "@/components/landing/LandingHero";
import LandingOnboarding from "@/components/landing/LandingOnboarding";
import LandingRoles from "@/components/landing/LandingRoles";
import LandingShowcase from "@/components/landing/LandingShowcase";
import LandingTrust from "@/components/landing/LandingTrust";
import LandingWorkflow from "@/components/landing/LandingWorkflow";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HR LAB — AI 채용 운영 플랫폼",
  description:
    "이력서 파싱, AI 면접 질문, 일정·면접관 관리, 지원자 예약까지 채용 전 과정을 연결합니다.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingShowcase />
        <LandingWorkflow />
        <LandingTrust />
        <LandingCompare />
        <LandingOnboarding />
        <LandingRoles />
        <LandingFaq />
        <LandingCta />
        <LandingContact />
      </main>
      <LandingFooter />
    </div>
  );
}