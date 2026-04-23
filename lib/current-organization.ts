import { createClient } from "@/lib/supabase-server"

export type CurrentOrganizationContext = {
  userId: string
  organizationId: string
  role: string | null
}

export async function getCurrentOrganizationContext(): Promise<CurrentOrganizationContext> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error("Unauthorized.")
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  const membership = membershipRows?.[0]

  if (!membership?.organization_id) {
    throw new Error("No organization membership found for this user.")
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role ?? null,
  }
}