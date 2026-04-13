"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"

type InviteRow = {
  id: string
  organization_id: string
  email: string
  role: string
  token: string
  created_at: string
  expires_at: string
  accepted: boolean
}

type OrganizationRow = {
  id: string
  name: string
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const params = useParams()
  const token = useMemo(() => {
    const raw = params?.token
    if (typeof raw === "string") return raw
    if (Array.isArray(raw)) return raw[0] ?? ""
    return ""
  }, [params])

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [statusMessage, setStatusMessage] = useState("Checking invite...")

  useEffect(() => {
    async function acceptInviteFlow() {
      if (!token) {
        setErrorMessage("Invite token missing.")
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage("")
      setStatusMessage("Checking invite...")

      const { data: invite, error: inviteError } = await supabaseClient
        .from("organization_invites")
        .select("id, organization_id, email, role, token, created_at, expires_at, accepted")
        .eq("token", token)
        .single<InviteRow>()

      if (inviteError || !invite) {
        setErrorMessage("Invite not found or no longer valid.")
        setLoading(false)
        return
      }

      if (invite.accepted) {
        setErrorMessage("This invite has already been used.")
        setLoading(false)
        return
      }

      const expiresAt = new Date(invite.expires_at)
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        setErrorMessage("This invite has expired.")
        setLoading(false)
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError) {
        setErrorMessage(userError.message)
        setLoading(false)
        return
      }

      if (!user) {
        const currentPath = `/accept-invite/${token}`
        if (typeof window !== "undefined") {
          localStorage.setItem("unitflow_pending_invite_path", currentPath)
        }
        router.replace(`/login?next=${encodeURIComponent(currentPath)}`)
        return
      }

      if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        setErrorMessage(
          `This invite was sent to ${invite.email}. You are currently logged in as ${user.email ?? "another account"}.`
        )
        setLoading(false)
        return
      }

      setStatusMessage("Joining organization...")

      const { data: existingMembership, error: existingMembershipError } =
        await supabaseClient
          .from("organization_members")
          .select("id, user_id, organization_id, role, created_at")
          .eq("user_id", user.id)
          .eq("organization_id", invite.organization_id)
          .maybeSingle()

      if (existingMembershipError) {
        setErrorMessage(existingMembershipError.message)
        setLoading(false)
        return
      }

      if (!existingMembership) {
        const { error: insertMembershipError } = await supabaseClient
          .from("organization_members")
          .insert([
            {
              user_id: user.id,
              organization_id: invite.organization_id,
              role: invite.role,
            },
          ])

        if (insertMembershipError) {
          setErrorMessage(insertMembershipError.message)
          setLoading(false)
          return
        }
      }

      setStatusMessage("Finalizing invite...")

      const { error: acceptInviteError } = await supabaseClient
        .from("organization_invites")
        .update({ accepted: true })
        .eq("id", invite.id)

      if (acceptInviteError) {
        setErrorMessage(acceptInviteError.message)
        setLoading(false)
        return
      }

      const { data: orgRow, error: orgError } = await supabaseClient
        .from("organizations")
        .select("id, name")
        .eq("id", invite.organization_id)
        .single<OrganizationRow>()

      if (orgError || !orgRow) {
        setErrorMessage("Joined organization, but failed to load organization.")
        setLoading(false)
        return
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("unitflow_active_organization_id", orgRow.id)
        localStorage.setItem("unitflow_active_organization_name", orgRow.name)
        localStorage.removeItem("unitflow_pending_invite_path")
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (profileError) {
        setErrorMessage(profileError.message)
        setLoading(false)
        return
      }

      setStatusMessage("Redirecting...")

      if (!profile) {
        router.replace("/create-profile")
        return
      }

      router.replace("/dashboard")
    }

    acceptInviteFlow()
  }, [router, token])

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 py-16">
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-8">
          <div className="mb-6 inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-zinc-300">
            UnitFlow
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Accept Invite</h1>

          {loading ? (
            <div className="mt-6">
              <p className="text-zinc-300">{statusMessage}</p>
              <p className="mt-2 text-sm text-zinc-500">
                Do not close this page while we finish your organization access.
              </p>
            </div>
          ) : errorMessage ? (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-red-300">{errorMessage}</p>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-emerald-300">Invite accepted.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}