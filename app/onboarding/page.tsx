"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"
import { getCurrentMembership } from "@/lib/current-membership"

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orgName, setOrgName] = useState("")
  const [inviteToken, setInviteToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [joiningInvite, setJoiningInvite] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    const tokenFromUrl = searchParams.get("inviteToken") ?? ""
    setInviteToken(tokenFromUrl)
  }, [searchParams])

  useEffect(() => {
    async function loadOnboarding() {
      setLoading(true)
      setError("")
      setSuccessMessage("")

      const { userId, membership, error: membershipError } =
        await getCurrentMembership()

      if (!userId) {
        const tokenFromUrl = searchParams.get("inviteToken") ?? ""
        if (tokenFromUrl) {
          router.replace(`/login?inviteToken=${encodeURIComponent(tokenFromUrl)}`)
        } else {
          router.replace("/login")
        }
        return
      }

      if (membershipError) {
        setError(membershipError)
        setLoading(false)
        return
      }

      if (membership) {
        router.replace("/dashboard")
        return
      }

      setLoading(false)
    }

    loadOnboarding()
  }, [router, searchParams])

  async function handleCreateOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    const trimmedName = orgName.trim()

    if (!trimmedName) {
      setError("Organization name is required.")
      return
    }

    setCreatingOrg(true)

    const { data, error: rpcError } = await supabaseClient.rpc(
      "create_my_organization",
      {
        org_name_input: trimmedName,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setCreatingOrg(false)
      return
    }

    if (!data) {
      setError("Failed to create organization.")
      setCreatingOrg(false)
      return
    }

    router.replace("/dashboard")
  }

  async function handleJoinWithInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    const trimmedToken = inviteToken.trim()

    if (!trimmedToken) {
      setError("Invite token is required.")
      return
    }

    setJoiningInvite(true)

    const { data, error: rpcError } = await supabaseClient.rpc(
      "accept_organization_invite",
      {
        invite_token_input: trimmedToken,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setJoiningInvite(false)
      return
    }

    if (!data) {
      setError("Failed to accept invite.")
      setJoiningInvite(false)
      return
    }

    setSuccessMessage("Invite accepted. Redirecting to dashboard...")

    setTimeout(() => {
      router.replace("/dashboard")
    }, 800)
  }

  if (loading) {
    return (
      <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
        <p className="text-sm text-zinc-400">Loading onboarding...</p>
      </div>
    )
  }

  const hasInviteToken = inviteToken.trim().length > 0

  return (
    <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        Onboarding
      </p>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Welcome to UnitFlow
      </h1>

      <p className="mt-2 text-zinc-400">
        Create your own organization or join an existing one with a secure invite.
      </p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="text-lg font-semibold">Join with invite</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {hasInviteToken
            ? "Your invite token was detected automatically."
            : "Paste the token from your invite link here."}
        </p>

        <form onSubmit={handleJoinWithInvite} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Invite token
            </label>
            <input
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="Paste token here"
              className="w-full rounded-2xl bg-black p-3 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={joiningInvite}
            className="w-full rounded-2xl bg-blue-600 p-3 transition hover:bg-blue-700 disabled:opacity-60"
          >
            {joiningInvite ? "Joining..." : "Join Organization"}
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="text-lg font-semibold">Create new organization</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Use this only if you are starting your own UnitFlow workspace.
        </p>

        <form onSubmit={handleCreateOrg} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Organization name
            </label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Cedar Grove Management"
              className="w-full rounded-2xl bg-black p-3 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={creatingOrg || hasInviteToken}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.06] disabled:opacity-60"
          >
            {creatingOrg ? "Creating..." : "Create Organization"}
          </button>
        </form>

        {hasInviteToken ? (
          <p className="mt-3 text-sm text-zinc-500">
            Organization creation is disabled while using an invite link.
          </p>
        ) : null}
      </div>
    </div>
  )
}