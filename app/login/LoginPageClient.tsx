"use client"

import { useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"

type AccountType = "staff" | "resident"
type AuthMode = "login" | "signup"

async function hasStaffOrganizationMembership() {
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser()

  if (userError || !user) {
    throw new Error("You must be logged in.")
  }

  const { data, error } = await supabaseClient
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return Array.isArray(data) && data.length > 0
}

export default function LoginPageClient() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<AuthMode>("login")
  const [accountType, setAccountType] = useState<AccountType>("staff")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function linkTenantAccount() {
    const response = await fetch("/api/tenant/link", {
      method: "POST",
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(result?.error || "Failed to link resident account.")
    }

    return result
  }

  async function handleResidentPostAuth() {
    await linkTenantAccount()
    window.location.assign("/tenant")
  }

  async function handleStaffPostAuth() {
    const hasMembership = await hasStaffOrganizationMembership()

    if (hasMembership) {
      window.location.assign("/dashboard")
      return
    }

    window.location.assign("/onboarding")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabaseClient.auth.signUp({
          email,
          password,
        })

        if (signUpError) {
          setMessage(signUpError.message)
          setLoading(false)
          return
        }

        const {
          data: { session },
        } = await supabaseClient.auth.getSession()

        if (accountType === "resident") {
          if (!session) {
            setMessage(
              "Resident account created. Now log in with the same email and password."
            )
            setMode("login")
            setLoading(false)
            return
          }

          try {
            await handleResidentPostAuth()
            return
          } catch (residentError) {
            await supabaseClient.auth.signOut()
            setMessage(
              residentError instanceof Error
                ? residentError.message
                : "Resident account was created, but no matching resident record was found."
            )
            setMode("login")
            setLoading(false)
            return
          }
        }

        if (!session) {
          setMessage("Staff account created. Now log in with the same email and password.")
          setMode("login")
          setLoading(false)
          return
        }

        await handleStaffPostAuth()
        return
      }

      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setMessage(signInError.message)
        setLoading(false)
        return
      }

      if (accountType === "resident") {
        try {
          await handleResidentPostAuth()
          return
        } catch (residentError) {
          await supabaseClient.auth.signOut()
          setMessage(
            residentError instanceof Error
              ? residentError.message
              : "No resident account found for this login."
          )
          setLoading(false)
          return
        }
      }

      await handleStaffPostAuth()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.")
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabaseClient.auth.signOut()
    window.location.assign("/login")
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-semibold">UnitFlow Access</h1>
          <p className="mt-2 text-zinc-400">
            Sign in or create an account for staff or resident access.
          </p>

          <div className="mt-6">
            <label className="mb-2 block text-sm text-zinc-400">Account Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccountType("staff")
                  setMessage("")
                }}
                className={`rounded px-4 py-3 text-sm ${
                  accountType === "staff"
                    ? "bg-white text-black"
                    : "bg-black/40 text-zinc-300"
                }`}
              >
                Staff
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountType("resident")
                  setMessage("")
                }}
                className={`rounded px-4 py-3 text-sm ${
                  accountType === "resident"
                    ? "bg-white text-black"
                    : "bg-black/40 text-zinc-300"
                }`}
              >
                Resident
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login")
                setMessage("")
              }}
              className={`rounded px-4 py-2 text-sm ${
                mode === "login"
                  ? "bg-white text-black"
                  : "bg-black/40 text-zinc-300"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup")
                setMessage("")
              }}
              className={`rounded px-4 py-2 text-sm ${
                mode === "signup"
                  ? "bg-white text-black"
                  : "bg-black/40 text-zinc-300"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Email</label>
              <input
                type="email"
                className="w-full rounded bg-black p-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Password</label>
              <input
                type="password"
                className="w-full rounded bg-black p-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {loading
                ? "Working..."
                : mode === "login"
                  ? `Login as ${accountType === "staff" ? "Staff" : "Resident"}`
                  : `Create ${accountType === "staff" ? "Staff" : "Resident"} Account`}
            </button>
          </form>

          {message ? (
            <p className="mt-4 text-sm text-zinc-300">{message}</p>
          ) : null}

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 w-full rounded border border-white/10 p-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  )
}