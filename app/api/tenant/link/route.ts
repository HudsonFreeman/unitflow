import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const authEmail = (user.email ?? "").trim().toLowerCase()

    if (!authEmail) {
      return NextResponse.json(
        { error: "Authenticated user does not have an email address." },
        { status: 400 }
      )
    }

    const { data: matchingTenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, email, user_id")
      .ilike("email", authEmail)
      .limit(1)
      .maybeSingle()

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 })
    }

    if (!matchingTenant) {
      return NextResponse.json(
        {
          linked: false,
          error: "No tenant record found that matches this login email.",
        },
        { status: 404 }
      )
    }

    if (matchingTenant.user_id && matchingTenant.user_id !== user.id) {
      return NextResponse.json(
        {
          linked: false,
          error: "This tenant record is already linked to a different user.",
        },
        { status: 409 }
      )
    }

    if (matchingTenant.user_id === user.id) {
      return NextResponse.json({
        linked: true,
        already_linked: true,
        tenant_id: matchingTenant.id,
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({ user_id: user.id })
      .eq("id", matchingTenant.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      linked: true,
      already_linked: false,
      tenant_id: matchingTenant.id,
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to link tenant account." },
      { status: 500 }
    )
  }
}