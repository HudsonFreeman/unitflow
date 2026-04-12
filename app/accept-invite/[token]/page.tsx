"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"

export default function AcceptInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params.token ?? "")

  const [message, setMessage] = useState("Processing invite...")
  const [error, setError] = useState("")

  useEffect(() => {
    async function acceptInvite() {
      if (!token) {
        setError("Missing invite token.")
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        router.replace(`/login?redirect=${encodeURIComponent(`/accept-invite/${token}`)}`)
        return
      }

      const { data: invite, error: inviteError } = await supabaseClient
        .from("organization_invites")
        .select("id, organization_id, email, role, token, expires_at, accepted")
        .eq("token", token)
        .single()

      if (inviteError || !invite) {
        setError("Invalid or expired invite.")
        return
      }

      if (!user.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        setError(`This invite is for ${invite.email}, not ${user.email}.`)
        return
      }

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        setError("This invite has expired.")
        return
      }

      const { data: existingMembership, error: existingMembershipError } =
        await supabaseClient
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", invite.organization_id)
          .maybeSingle()

      if (existingMembershipError) {
        setError(existingMembershipError.message)
        return
      }

      if (!existingMembership) {
        const { error: insertMembershipError } = await supabaseClient
          .from("organization_members")
          .insert({
            user_id: user.id,
            organization_id: invite.organization_id,
            role: invite.role || "staff",
          })

        if (insertMembershipError) {
          setError(insertMembershipError.message)
          return
        }
      }

      const { error: activeOrgError } = await supabaseClient
        .from("user_active_org")
        .upsert(
          {
            user_id: user.id,
            organization_id: invite.organization_id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        )

      if (activeOrgError) {
        setError(activeOrgError.message)
        return
      }

      if (!invite.accepted) {
        const { error: acceptError } = await supabaseClient
          .from("organization_invites")
          .update({ accepted: true })
          .eq("id", invite.id)

        if (acceptError) {
          setError(acceptError.message)
          return
        }
      }

      setMessage("Invite accepted. Redirecting...")
      window.location.href = "/dashboard"
    }

    acceptInvite()
  }, [token, router])

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6">
        {error ? (
          <>
            <h1 className="text-2xl font-semibold">Invite problem</h1>
            <p className="mt-2 text-sm text-red-300">{error}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Accepting invite</h1>
            <p className="mt-2 text-sm text-zinc-300">{message}</p>
          </>
        )}
      </div>
    </main>
  )
}