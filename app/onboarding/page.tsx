"use client"

import { Suspense } from "react"
import OnboardingPageClient from "./OnboardingPageClient"

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 p-6 text-white">
          Loading onboarding...
        </div>
      }
    >
      <OnboardingPageClient />
    </Suspense>
  )
}