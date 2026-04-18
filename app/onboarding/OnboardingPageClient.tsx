"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"

export default function OnboardingPageClient() {
  const router = useRouter()

  useEffect(() => {
    async function routeUser() {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()

      if (!user) {
        router.replace("/login")
        return
      }

      const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (error) {
        router.replace("/login")
        return
      }

      if (!profile) {
        router.replace("/create-profile")
        return
      }

      router.replace("/dashboard")
    }

    routeUser()
  }, [router])

  return (
    <div className="p-6 text-white">Redirecting...</div>
  )
}