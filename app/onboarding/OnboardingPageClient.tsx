"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"

type MembershipRow = {
  id: string
  organization_id: string
  role: string | null
}

export default function OnboardingPageClient() {
  const router = useRouter()

  const [organizationName, setOrganizationName] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    async function checkExistingMembership() {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        router.replace("/login")
        return
      }

      const { data: membershipRows, error: membershipError } = await supabaseClient
        .from("organization_members")
        .select("id, organization_id, role")
        .eq("user_id", user.id)
        .limit(1)

      if (membershipError) {
        setMessage(membershipError.message)
        setLoading(false)
        return
      }

      const membership = (membershipRows?.[0] ?? null) as MembershipRow | null

      if (membership) {
        router.replace("/dashboard")
        return
      }

      setLoading(false)
    }

    checkExistingMembership()
  }, [router])

  async function handleCreateOrganization(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const trimmedName = organizationName.trim()

    if (!trimmedName) {
      setMessage("Organization name is required.")
      return
    }

    setSubmitting(true)
    setMessage("")

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        setMessage("You must be logged in.")
        setSubmitting(false)
        return
      }

      const { data: existingMembershipRows, error: existingMembershipError } =
        await supabaseClient
          .from("organization_members")
          .select("id, organization_id, role")
          .eq("user_id", user.id)
          .limit(1)

      if (existingMembershipError) {
        setMessage(existingMembershipError.message)
        setSubmitting(false)
        return
      }

      const existingMembership = (existingMembershipRows?.[0] ?? null) as MembershipRow | null

      if (existingMembership) {
        router.replace("/dashboard")
        return
      }

      const organizationId = crypto.randomUUID()

      const { error: organizationError } = await supabaseClient
        .from("organizations")
        .insert([
          {
            id: organizationId,
            name: trimmedName,
          },
        ])

      if (organizationError) {
        setMessage(organizationError.message)
        setSubmitting(false)
        return
      }

      const { error: membershipInsertError } = await supabaseClient
        .from("organization_members")
        .insert([
          {
            user_id: user.id,
            organization_id: organizationId,
            role: "manager",
          },
        ])

      if (membershipInsertError) {
        setMessage(membershipInsertError.message)
        setSubmitting(false)
        return
      }

      router.replace("/dashboard")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-3xl font-semibold">Set up your organization</h1>
            <p className="mt-2 text-zinc-400">Checking your account...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-semibold">Create your organization</h1>
          <p className="mt-2 text-zinc-400">
            This is the company or housing portfolio that will own the data inside UnitFlow.
          </p>

          <form onSubmit={handleCreateOrganization} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Organization Name
              </label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Example: Hudson Portfolio"
                className="w-full rounded bg-black p-3 text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-white px-4 py-3 font-medium text-black disabled:opacity-60"
            >
              {submitting ? "Creating organization..." : "Create Organization"}
            </button>
          </form>

          {message ? (
            <p className="mt-4 text-sm text-zinc-300">{message}</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}