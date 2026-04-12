"use client"

import { Suspense } from "react"
import LoginPageClient from "./LoginPageClient"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-white">
          <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h1 className="text-3xl font-semibold">UnitFlow Login</h1>
              <p className="mt-2 text-zinc-400">Loading...</p>
            </div>
          </div>
        </main>
      }
    >
      <LoginPageClient />
    </Suspense>
  )
}