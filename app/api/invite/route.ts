import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

type OrganizationRow = {
  id: string
  name: string
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

type ActiveOrgRow = {
  organization_id: string
}

type OrganizationMemberRow = {
  user_id: string
  organization_id: string
  role: string
}

export async function POST(request: Request) {
  try {
    const authClient = await createClient()

    const authHeader = request.headers.get("authorization") ?? ""
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : ""

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const body = await request.json()

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase()

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 })
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken)

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: activeOrg, error: activeOrgError } = await supabaseAdmin
      .from("user_active_org")
      .select("organization_id")
      .eq("user_id", user.id)
      .single()

    if (activeOrgError || !activeOrg) {
      return NextResponse.json(
        { error: "No active organization found." },
        { status: 403 }
      )
    }

    const typedActiveOrg = activeOrg as ActiveOrgRow

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, organization_id, role")
      .eq("user_id", user.id)
      .eq("organization_id", typedActiveOrg.organization_id)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "No membership found for the active organization." },
        { status: 403 }
      )
    }

    const typedMembership = membership as OrganizationMemberRow

    if (typedMembership.role.toLowerCase() !== "manager") {
      return NextResponse.json(
        { error: "Only managers can send invites." },
        { status: 403 }
      )
    }

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", typedMembership.organization_id)
      .single()

    if (organizationError || !organization) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      )
    }

    const typedOrganization = organization as OrganizationRow

    const { data: existingPendingInvites, error: existingInviteError } =
      await supabaseAdmin
        .from("organization_invites")
        .select("id")
        .eq("organization_id", typedMembership.organization_id)
        .eq("email", email)
        .eq("accepted", false)

    if (existingInviteError) {
      return NextResponse.json(
        { error: existingInviteError.message },
        { status: 500 }
      )
    }

    if ((existingPendingInvites ?? []).length > 0) {
      return NextResponse.json(
        { error: "A pending invite already exists for that email." },
        { status: 400 }
      )
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("organization_invites")
      .insert({
        organization_id: typedMembership.organization_id,
        email,
        role: "staff",
        token,
        expires_at: expiresAt,
      })
      .select(
        "id, organization_id, email, role, token, created_at, expires_at, accepted"
      )
      .single()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message ?? "Failed to create invite." },
        { status: 500 }
      )
    }

    const typedInvite = invite as InviteRow
    const origin = new URL(request.url).origin
    const inviteLink = `${origin}/accept-invite/${typedInvite.token}`

    let emailSent = false
    let emailErrorMessage = ""

    if (resend) {
      const emailResult = await resend.emails.send({
        from: "UnitFlow <onboarding@resend.dev>",
        to: [typedInvite.email],
        subject: `You're invited to join ${typedOrganization.name} on UnitFlow`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
            <h1 style="margin-bottom: 12px;">You're invited to UnitFlow</h1>
            <p>You have been invited to join <strong>${typedOrganization.name}</strong>.</p>
            <p>Click the button below to accept your invite and join the organization.</p>
            <p style="margin: 24px 0;">
              <a
                href="${inviteLink}"
                style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
              >
                Accept Invite
              </a>
            </p>
            <p>If the button does not work, use this link:</p>
            <p style="word-break: break-all;">${inviteLink}</p>
            <p style="margin-top: 24px; color: #666;">
              This invite expires on ${new Date(typedInvite.expires_at).toLocaleString()}.
            </p>
          </div>
        `,
        text: [
          "You're invited to UnitFlow.",
          "",
          `Organization: ${typedOrganization.name}`,
          `Accept invite: ${inviteLink}`,
          "",
          `This invite expires on ${new Date(typedInvite.expires_at).toLocaleString()}.`,
        ].join("\n"),
      })

      if (emailResult.error) {
        emailErrorMessage = emailResult.error.message
      } else {
        emailSent = true
      }
    } else {
      emailErrorMessage = "RESEND_API_KEY is not set."
    }

    return NextResponse.json({
      success: true,
      invite: typedInvite,
      inviteLink,
      emailSent,
      emailErrorMessage,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error.",
      },
      { status: 500 }
    )
  }
}