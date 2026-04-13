"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"

export default function CreateProfilePage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return alert("Enter your name")

    setLoading(true)

    const { data: userData } = await supabaseClient.auth.getUser()
    const user = userData?.user

    if (!user) {
      alert("Not logged in")
      return
    }

    const { error } = await supabaseClient.from("profiles").insert({
      user_id: user.id,
      full_name: name,
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Create your profile</h1>

        <input
          type="text"
          placeholder="Full name"
          className="w-full rounded-lg bg-black border border-white/10 p-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-white text-black py-3 rounded-lg font-semibold"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </div>
    </main>
  )
}