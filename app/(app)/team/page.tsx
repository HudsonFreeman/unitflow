"use client"

import { useEffect, useMemo, useState } from "react"
import { getCurrentMembership } from "@/lib/current-membership"
import { supabaseClient } from "@/lib/supabase-client"

type MemberRow = {
  id: string
  user_id: string
  organization_id: string
  role: string
  created_at: string
  full_name: string | null
}

type ProfileRow = {
  user_id: string
  full_name: string | null
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

const roleOptions = ["manager", "staff"] as const

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function getInviteStatus(invite: InviteRow) {
  if (invite.accepted) return "accepted"
  if (new Date(invite.expires_at) < new Date()) return "expired"
  return "pending"
}

function getDaysUntilExpiry(value: string) {
  const now = new Date()
  const expires = new Date(value)

  if (Number.isNaN(expires.getTime())) return null

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const expiresStart = new Date(
    expires.getFullYear(),
    expires.getMonth(),
    expires.getDate()
  )

  const diffMs = expiresStart.getTime() - nowStart.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function getRoleDescription(role: string) {
  switch (role.toLowerCase()) {
    case "manager":
      return "Full control over properties, tenants, transfers, and team access"
    case "staff":
      return "Can view the team and help with day-to-day operational work"
    default:
      return "Organization role"
  }
}

function getMemberLabel(member: MemberRow, isSelf: boolean) {
  if (isSelf) return "You"
  if (member.full_name?.trim()) return member.full_name.trim()
  return "Unnamed User"
}

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

    const rawMembers = (memberData ?? []) as Array<{
      id: string
      user_id: string
      organization_id: string
      role: string
      created_at: string
    }>

    const userIds = rawMembers.map((member) => member.user_id)

    const profilesMap = new Map<string, string | null>()

    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabaseClient
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)

      if (profilesError) {
        setError(profilesError.message)
        setLoading(false)
        return
      }

      for (const profile of (profilesData ?? []) as ProfileRow[]) {
        profilesMap.set(profile.user_id, profile.full_name)
      }
    }

    const mergedMembers: MemberRow[] = rawMembers.map((member) => ({
      ...member,
      full_name: profilesMap.get(member.user_id) ?? null,
    }))

    setMembers(mergedMembers)

    // only show pending invites in invite section
    const pendingInvites = ((inviteData ?? []) as InviteRow[]).filter(
      (invite) => getInviteStatus(invite) === "pending"
    )
    setInvites(pendingInvites)

    setLoading(false)
  }

  useEffect(() => {
    loadTeam()
  }, [])

  const pendingInviteCount = useMemo(() => invites.length, [invites])

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
      `Remove ${member.full_name?.trim() || "this member"} from the organization?`
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

    const existingMemberWithEmail = false

    const duplicatePendingInvite = invites.some(
      (invite) =>
        invite.email.toLowerCase() === cleanedEmail &&
        !invite.accepted &&
        new Date(invite.expires_at) > new Date()
    )

    if (existingMemberWithEmail) {
      setError("That user is already on the team.")
      return
    }

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

    const confirmed = window.confirm("Revoke this pending invite?")

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

  if (loading) {
    return <p className="text-zinc-400">Loading team...</p>
  }

  if (error && members.length === 0 && invites.length === 0) {
    return <p className="text-red-500">{error}</p>
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Team</h1>
      <p className="mt-2 text-zinc-400">
        Only members of your organization can access this portfolio.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Organization Access</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">Organization</p>
            <p className="mt-1 text-sm text-zinc-200 break-all">{organizationId}</p>
          </div>

          <div>
            <p className="text-xs text-zinc-500">Your Role</p>
            <p className="mt-1 text-sm capitalize text-zinc-200">
              {isManager ? "Manager • Full Access" : "Staff"}
            </p>
          </div>

          <div>
            <p className="text-xs text-zinc-500">Members</p>
            <p className="mt-1 text-sm text-zinc-200">{members.length}</p>
          </div>

          <div>
            <p className="text-xs text-zinc-500">Pending Invites</p>
            <p className="mt-1 text-sm text-zinc-200">{pendingInviteCount}</p>
          </div>
        </div>

        {!isManager ? (
          <p className="mt-4 text-sm text-amber-300">
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
        <h2 className="text-xl font-semibold">Add a Team Member</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Invite a manager or staff member into this organization.
        </p>

        <div className="mt-4 flex gap-2">
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
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-zinc-400">Role Access</p>
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <p>
              <span className="font-medium text-white">Manager</span> —{" "}
              {getRoleDescription("manager")}
            </p>
            <p>
              <span className="font-medium text-white">Staff</span> —{" "}
              {getRoleDescription("staff")}
            </p>
          </div>
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
              Only invites still waiting for acceptance appear here.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-zinc-300">
            {invites.length} total
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {invites.length === 0 ? (
            <p className="text-sm text-zinc-400">No pending invites.</p>
          ) : (
            invites.map((invite) => {
              const inviteLink = `${window.location.origin}/accept-invite/${invite.token}`
              const isRemovingInvite = removingInviteId === invite.id
              const daysUntilExpiry = getDaysUntilExpiry(invite.expires_at)

              return (
                <div
                  key={invite.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-white">{invite.email}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm capitalize text-zinc-200">
                          {invite.role}
                        </span>

                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-sm capitalize text-amber-300">
                          pending
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500">
                        Sent: {formatShortDate(invite.created_at)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {daysUntilExpiry === null
                          ? `Expires: ${formatDate(invite.expires_at)}`
                          : daysUntilExpiry < 0
                          ? "Invite expired"
                          : `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`}
                      </p>

                      {isManager ? (
                        <>
                          <p className="mt-3 text-xs text-zinc-400">Invite link</p>
                          <p className="mt-1 break-all text-xs text-zinc-300">
                            {inviteLink}
                          </p>
                        </>
                      ) : null}
                    </div>

                    {isManager ? (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyInviteLink(inviteLink)}
                          className="rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600"
                        >
                          Copy Invite Link
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={!isManager || isRemovingInvite}
                          className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {isRemovingInvite ? "Revoking..." : "Revoke Invite"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Team Members</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Everyone with real access to this organization appears here.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {members.length === 0 ? (
            <p className="text-zinc-400">No team members found.</p>
          ) : (
            members.map((member) => {
              const isSaving = savingMemberId === member.id
              const isRemoving = removingMemberId === member.id
              const isSelf = member.user_id === currentUserId

              return (
                <div
                  key={member.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-white">
                        {getMemberLabel(member, isSelf)}
                        {isSelf ? (
                          <span className="ml-2 text-sm text-zinc-400">
                            ({member.role === "manager" ? "Manager" : "Staff"})
                          </span>
                        ) : null}
                      </p>

                      {isManager ? (
                        <p className="mt-1 text-xs text-zinc-500 break-all">
                          ID: {member.user_id}
                        </p>
                      ) : null}

                      <p className="mt-2 text-sm text-zinc-400">
                        {member.role === "manager"
                          ? "Manager • Full Access"
                          : "Staff • Team Visibility"}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {getRoleDescription(member.role)}
                      </p>

                      <p className="mt-3 text-xs text-zinc-500">
                        Joined {formatDate(member.created_at)}
                      </p>
                    </div>

                    {isManager ? (
                      <div className="flex min-w-[220px] flex-col gap-3">
                        <div>
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

                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={!isManager || isSelf || isSaving || isRemoving}
                          className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {isSelf
                            ? "You"
                            : isRemoving
                            ? "Removing..."
                            : "Remove Member"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {isManager && (isSaving || isRemoving) ? (
                    <p className="mt-3 text-xs text-zinc-500">
                      {isSaving ? "Saving changes..." : "Removing member..."}
                    </p>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}