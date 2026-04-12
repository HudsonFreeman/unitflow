"use client"

import { Suspense } from "react"
import OnboardingPageClient from "./OnboardingPageClient"

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="text-white p-6">Loading...</div>}>
      <OnboardingPageClient />
    </Suspense>
  )
}