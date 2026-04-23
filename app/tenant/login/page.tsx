import { redirect } from "next/navigation"

export default function TenantLoginRedirectPage() {
  redirect("/login")
}