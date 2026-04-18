"use client"

import { useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"

export default function LoginPageClient() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    try {
      if (mode === "signup") {
        const { error } = await supabaseClient.auth.signUp({
          email,
          password,
        })

        if (error) {
          setMessage(error.message)
          setLoading(false)
          return
        }

        await supabaseClient.auth.getSession()
        window.location.assign("/dashboard")
        return
      }

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      await supabaseClient.auth.getSession()
      window.location.assign("/dashboard")
    } catch {
      setMessage("Something went wrong.")
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
          <h1 className="text-3xl font-semibold">UnitFlow Login</h1>
          <p className="mt-2 text-zinc-400">
            Sign in to manage properties, units, tenants, and transfers.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
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
              onClick={() => setMode("signup")}
              className={`rounded px-4 py-2 text-sm ${
                mode === "signup"
                  ? "bg-white text-black"
                  : "bg-black/40 text-zinc-300"
              }`}
            >
              Sign Up
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
                ? "Login"
                : "Create Account"}
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