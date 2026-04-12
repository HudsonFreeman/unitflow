import { supabase } from "@/lib/supabase"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const formData = await request.formData()

  const organization_id = String(formData.get("organization_id") ?? "")
  const property_id = String(formData.get("property_id") ?? "")
  const unit_id = String(formData.get("unit_id") ?? "")
  const first_name = String(formData.get("first_name") ?? "")
  const last_name = String(formData.get("last_name") ?? "")
  const email = String(formData.get("email") ?? "")
  const phone = String(formData.get("phone") ?? "")
  const lease_start = String(formData.get("lease_start") ?? "")
  const lease_end = String(formData.get("lease_end") ?? "")

  const { error } = await supabase.from("tenants").insert([
    {
      organization_id,
      property_id,
      unit_id,
      first_name,
      last_name,
      email: email || null,
      phone: phone || null,
      lease_start: lease_start || null,
      lease_end: lease_end || null,
      status: "active",
    },
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.redirect(new URL("/tenants", request.url))
}