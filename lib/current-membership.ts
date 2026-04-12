import { getActiveOrganizationContext } from "@/lib/active-organization"

export type OrganizationMemberRow = {
  id?: string
  user_id: string
  organization_id: string
  role: string
  created_at?: string
}

export type CurrentMembershipResult = {
  userId: string | null
  membership: OrganizationMemberRow | null
  error: string
}

export async function getCurrentMembership(): Promise<CurrentMembershipResult> {
  const result = await getActiveOrganizationContext()

  return {
    userId: result.userId,
    membership: result.membership,
    error: result.error,
  }
}