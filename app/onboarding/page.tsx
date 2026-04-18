"use client"

import { Suspense } from "react"
import OnboardingPageClient from "./OnboardingPageClient"

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Redirecting...</div>}>
      <OnboardingPageClient />
    </Suspense>
  )
}