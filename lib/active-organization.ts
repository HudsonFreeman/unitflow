import { supabaseClient } from "@/lib/supabase-client"

export type OrganizationRow = {
  id: string
  name: string
  created_at?: string
}

export type OrganizationMemberRow = {
  id?: string
  user_id: string
  organization_id: string
  role: string
  created_at?: string
}

export type UserActiveOrgRow = {
  user_id: string
  organization_id: string
  updated_at?: string
}

export type ActiveOrganizationResult = {
  userId: string | null
  activeOrganizationId: string
  membership: OrganizationMemberRow | null
  memberships: OrganizationMemberRow[]
  organizations: OrganizationRow[]
  error: string
}

export async function getActiveOrganizationContext(): Promise<ActiveOrganizationResult> {
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser()

  if (userError || !user) {
    return {
      userId: null,
      activeOrganizationId: "",
      membership: null,
      memberships: [],
      organizations: [],
      error: "You must be logged in.",
    }
  }

  const { data: membershipsData, error: membershipsError } = await supabaseClient
    .from("organization_members")
    .select("id, user_id, organization_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (membershipsError) {
    return {
      userId: user.id,
      activeOrganizationId: "",
      membership: null,
      memberships: [],
      organizations: [],
      error: membershipsError.message,
    }
  }

  const memberships = (membershipsData ?? []) as OrganizationMemberRow[]

  if (memberships.length === 0) {
    return {
      userId: user.id,
      activeOrganizationId: "",
      membership: null,
      memberships: [],
      organizations: [],
      error: "",
    }
  }

  const { data: activeOrgData, error: activeOrgError } = await supabaseClient
    .from("user_active_org")
    .select("user_id, organization_id, updated_at")
    .eq("user_id", user.id)
    .maybeSingle()

  if (activeOrgError) {
    return {
      userId: user.id,
      activeOrganizationId: "",
      membership: null,
      memberships,
      organizations: [],
      error: activeOrgError.message,
    }
  }

  let activeOrganizationId =
    (activeOrgData as UserActiveOrgRow | null)?.organization_id ?? ""

  const validActiveMembership = memberships.find(
    (membership) => membership.organization_id === activeOrganizationId
  )

  if (!validActiveMembership) {
    activeOrganizationId = memberships[0].organization_id

    const { error: upsertError } = await supabaseClient.from("user_active_org").upsert(
      {
        user_id: user.id,
        organization_id: activeOrganizationId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    )

    if (upsertError) {
      return {
        userId: user.id,
        activeOrganizationId: "",
        membership: null,
        memberships,
        organizations: [],
        error: upsertError.message,
      }
    }
  }

  const organizationIds = memberships.map((membership) => membership.organization_id)

  const { data: organizationsData, error: organizationsError } = await supabaseClient
    .from("organizations")
    .select("id, name, created_at")
    .in("id", organizationIds)
    .order("created_at", { ascending: true })

  if (organizationsError) {
    return {
      userId: user.id,
      activeOrganizationId,
      membership:
        memberships.find(
          (membership) => membership.organization_id === activeOrganizationId
        ) ?? null,
      memberships,
      organizations: [],
      error: organizationsError.message,
    }
  }

  const organizations = (organizationsData ?? []) as OrganizationRow[]

  return {
    userId: user.id,
    activeOrganizationId,
    membership:
      memberships.find(
        (membership) => membership.organization_id === activeOrganizationId
      ) ?? null,
    memberships,
    organizations,
    error: "",
  }
}

export async function setActiveOrganization(organizationId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser()

  if (userError || !user) {
    return { error: "You must be logged in." }
  }

  const { data: membership, error: membershipError } = await supabaseClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (membershipError) {
    return { error: membershipError.message }
  }

  if (!membership) {
    return { error: "You do not belong to that organization." }
  }

  const { error: upsertError } = await supabaseClient.from("user_active_org").upsert(
    {
      user_id: user.id,
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  )

  if (upsertError) {
    return { error: upsertError.message }
  }

  return { error: "" }
}