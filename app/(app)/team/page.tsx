"use client"

import { useEffect, useState } from "react"
import { getCurrentMembership } from "@/lib/current-membership"
import { supabaseClient } from "@/lib/supabase-client"

type MemberRow = {
  id: string
  user_id: string
  organization_id: string
  role: string
  created_at: string
}

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

const roleOptions = ["manager", "leasing", "staff"] as const

export default function TeamPage() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [currentUserId, setCurrentUserId] = useState("")
  const [role, setRole] = useState("")
  const [savingMemberId, setSavingMemberId] = useState("")
  const [removingMemberId, setRemovingMemberId] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [latestInviteLink, setLatestInviteLink] = useState("")
  const [removingInviteId, setRemovingInviteId] = useState("")

  const isManager = role.toLowerCase() === "manager"

  useEffect(() => {
    async function loadTeam() {
      setLoading(true)
      setError("")
      setSuccessMessage("")

      const { userId, membership, error: membershipError } =
        await getCurrentMembership()

      if (membershipError || !membership || !userId) {
        setError("Failed to load membership.")
        setLoading(false)
        return
      }

      setCurrentUserId(userId)
      setRole(membership.role)
      setOrganizationId(membership.organization_id)

      const [
        { data: memberData, error: memberError },
        { data: inviteData, error: inviteError },
      ] = await Promise.all([
        supabaseClient
          .from("organization_members")
          .select("id, user_id, organization_id, role, created_at")
          .eq("organization_id", membership.organization_id)
          .order("created_at", { ascending: true }),
        supabaseClient
          .from("organization_invites")
          .select(
            "id, organization_id, email, role, token, created_at, expires_at, accepted"
          )
          .eq("organization_id", membership.organization_id)
          .order("created_at", { ascending: false }),
      ])

      if (memberError) {
        setError(memberError.message)
        setLoading(false)
        return
      }

      if (inviteError) {
        setError(inviteError.message)
        setLoading(false)
        return
      }

      setMembers((memberData ?? []) as MemberRow[])
      setInvites((inviteData ?? []) as InviteRow[])
      setLoading(false)
    }

    loadTeam()
  }, [])

  async function writeAuditLog(input: {
    action: string
    targetType: string
    targetId?: string
    details?: Record<string, unknown>
  }) {
    if (!organizationId || !currentUserId) return

    await supabaseClient.from("audit_logs").insert([
      {
        organization_id: organizationId,
        actor_user_id: currentUserId,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        details: input.details ?? {},
      },
    ])
  }

  async function handleRoleChange(memberId: string, nextRole: string) {
    if (!isManager) {
      setError("Only managers can change roles.")
      return
    }

    setError("")
    setSuccessMessage("")
    setSavingMemberId(memberId)

    const member = members.find((item) => item.id === memberId)

    if (!member) {
      setError("Member not found.")
      setSavingMemberId("")
      return
    }

    if (member.organization_id !== organizationId) {
      setError("You cannot update a member outside your organization.")
      setSavingMemberId("")
      return
    }

    const previousRole = member.role

    const { error } = await supabaseClient
      .from("organization_members")
      .update({ role: nextRole })
      .eq("id", memberId)
      .eq("organization_id", organizationId)

    if (error) {
      setError(error.message)
      setSavingMemberId("")
      return
    }

    setMembers((current) =>
      current.map((item) =>
        item.id === memberId ? { ...item, role: nextRole } : item
      )
    )

    await writeAuditLog({
      action: "member_role_updated",
      targetType: "organization_member",
      targetId: memberId,
      details: {
        member_user_id: member.user_id,
        previous_role: previousRole,
        new_role: nextRole,
      },
    })

    setSuccessMessage("Role updated.")
    setSavingMemberId("")
  }

  async function handleRemoveMember(memberId: string) {
    if (!isManager) {
      setError("Only managers can remove members.")
      return
    }

    setError("")
    setSuccessMessage("")

    const member = members.find((item) => item.id === memberId)

    if (!member) {
      setError("Member not found.")
      return
    }

    if (member.organization_id !== organizationId) {
      setError("You cannot remove a member outside your organization.")
      return
    }

    if (member.user_id === currentUserId) {
      setError("You cannot remove yourself.")
      return
    }

    const confirmed = window.confirm(
      "Remove this member from the organization?"
    )

    if (!confirmed) return

    setRemovingMemberId(memberId)

    const { error } = await supabaseClient
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organizationId)

    if (error) {
      setError(error.message)
      setRemovingMemberId("")
      return
    }

    setMembers((current) => current.filter((item) => item.id !== memberId))

    await writeAuditLog({
      action: "member_removed",
      targetType: "organization_member",
      targetId: memberId,
      details: {
        removed_user_id: member.user_id,
        removed_role: member.role,
      },
    })

    setSuccessMessage("Member removed.")
    setRemovingMemberId("")
  }

  async function handleInvite() {
    if (!isManager) {
      setError("Only managers can send invites.")
      return
    }

    setError("")
    setSuccessMessage("")
    setLatestInviteLink("")

    const cleanedEmail = inviteEmail.trim().toLowerCase()

    if (!cleanedEmail) {
      setError("Email required.")
      return
    }

    const duplicatePendingInvite = invites.some(
      (invite) =>
        invite.email.toLowerCase() === cleanedEmail &&
        !invite.accepted &&
        new Date(invite.expires_at) > new Date()
    )

    if (duplicatePendingInvite) {
      setError("A pending invite already exists for that email.")
      return
    }

    setInviting(true)

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession()

      if (sessionError || !session?.access_token) {
        setError("You must be logged in.")
        setInviting(false)
        return
      }

      const response = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: cleanedEmail,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error ?? "Failed to send invite email.")
        setInviting(false)
        return
      }

      const createdInvite = result.invite as InviteRow
      const inviteLink = result.inviteLink as string

      setInvites((current) => [createdInvite, ...current])
      setLatestInviteLink(inviteLink)
      setSuccessMessage(
        result.emailSent
          ? "Invite email sent."
          : "Invite created. Email was not sent, but the invite link is ready."
      )
      setInviteEmail("")
      setInviting(false)

      await writeAuditLog({
        action: "invite_created",
        targetType: "organization_invite",
        targetId: createdInvite.id,
        details: {
          invited_email: createdInvite.email,
          invite_role: createdInvite.role,
          expires_at: createdInvite.expires_at,
        },
      })
    } catch {
      setError("Failed to send invite email.")
      setInviting(false)
    }
  }

  async function handleCopyInviteLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setError("")
      setSuccessMessage("Invite link copied.")
    } catch {
      setError("Failed to copy invite link.")
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!isManager) {
      setError("Only managers can revoke invites.")
      return
    }

    setError("")
    setSuccessMessage("")
    setRemovingInviteId(inviteId)

    const invite = invites.find((item) => item.id === inviteId)

    if (!invite) {
      setError("Invite not found.")
      setRemovingInviteId("")
      return
    }

    const confirmed = window.confirm("Revoke this invite?")

    if (!confirmed) {
      setRemovingInviteId("")
      return
    }

    const { error } = await supabaseClient
      .from("organization_invites")
      .delete()
      .eq("id", inviteId)
      .eq("organization_id", organizationId)

    if (error) {
      setError(error.message)
      setRemovingInviteId("")
      return
    }

    setInvites((current) => current.filter((item) => item.id !== inviteId))

    await writeAuditLog({
      action: "invite_revoked",
      targetType: "organization_invite",
      targetId: inviteId,
      details: {
        invited_email: invite.email,
        invite_role: invite.role,
      },
    })

    setSuccessMessage("Invite revoked.")
    setRemovingInviteId("")
  }

  function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  function getInviteStatus(invite: InviteRow) {
    if (invite.accepted) return "accepted"
    if (new Date(invite.expires_at) < new Date()) return "expired"
    return "pending"
  }

  if (loading) {
    return <p className="text-zinc-400">Loading team...</p>
  }

  if (error && members.length === 0 && invites.length === 0) {
    return <p className="text-red-500">{error}</p>
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Team</h1>
      <p className="mt-2 text-zinc-400">Manage your organization members.</p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Signed-in role</p>
        <p className="mt-1 text-sm capitalize text-zinc-200">{role}</p>

        {!isManager ? (
          <p className="mt-3 text-sm text-amber-300">
            You can view the team, but only managers can make changes.
          </p>
        ) : null}
      </div>

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Invite team member</p>

        <div className="mt-3 flex gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 rounded bg-black p-2 text-white"
            disabled={!isManager}
          />

          <button
            type="button"
            onClick={handleInvite}
            disabled={!isManager || inviting}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {inviting ? "Sending..." : "Invite"}
          </button>
        </div>

        {latestInviteLink ? (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-400">Latest invite link</p>
            <p className="mt-2 break-all text-sm text-white">{latestInviteLink}</p>

            <button
              type="button"
              onClick={() => handleCopyInviteLink(latestInviteLink)}
              className="mt-3 rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600"
            >
              Copy Invite Link
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Pending Invites</h2>
            <p className="mt-1 text-sm text-zinc-400">
              View, copy, and revoke organization invites.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-zinc-300">
            {invites.length} total
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {invites.length === 0 ? (
            <p className="text-sm text-zinc-400">No invites yet.</p>
          ) : (
            invites.map((invite) => {
              const inviteStatus = getInviteStatus(invite)
              const inviteLink = `${window.location.origin}/accept-invite/${invite.token}`
              const isRemovingInvite = removingInviteId === invite.id

              return (
                <div
                  key={invite.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-400">Email</p>
                      <p className="break-all text-white">{invite.email}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm capitalize text-zinc-200">
                          {invite.role}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-sm capitalize ${
                            inviteStatus === "pending"
                              ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                              : inviteStatus === "accepted"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                              : "border-red-500/20 bg-red-500/10 text-red-300"
                          }`}
                        >
                          {inviteStatus}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500">
                        Created: {formatDate(invite.created_at)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Expires: {formatDate(invite.expires_at)}
                      </p>

                      <p className="mt-3 text-xs text-zinc-400">Invite link</p>
                      <p className="mt-1 break-all text-xs text-zinc-300">
                        {inviteLink}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyInviteLink(inviteLink)}
                        className="rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600"
                      >
                        Copy Link
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(invite.id)}
                        disabled={!isManager || isRemovingInvite}
                        className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {isRemovingInvite ? "Revoking..." : "Revoke"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {members.map((member) => {
          const isSaving = savingMemberId === member.id
          const isRemoving = removingMemberId === member.id
          const isSelf = member.user_id === currentUserId

          return (
            <div
              key={member.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <p className="text-sm text-zinc-400">User ID</p>
              <p className="break-all text-white">{member.user_id}</p>

              <div className="mt-4">
                <label className="mb-1 block text-sm text-zinc-400">Role</label>
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  disabled={!isManager || isSaving || isRemoving}
                  className="w-full rounded bg-black p-2 text-white"
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                  {isSaving
                    ? "Saving..."
                    : isRemoving
                    ? "Removing..."
                    : "Created at: " + formatDate(member.created_at)}
                </p>

                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={!isManager || isSelf || isSaving || isRemoving}
                  className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isSelf ? "You" : isRemoving ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {members.length === 0 ? (
        <p className="mt-6 text-zinc-400">No team members found.</p>
      ) : null}
    </div>
  )
}