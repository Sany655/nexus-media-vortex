"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-emerald-500/30">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-emerald-600">
          <Activity size={48} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-neutral-900 dark:text-white">
          Create Genesis Account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-[#111111] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-black/5 dark:border-white/5">
          <form className="space-y-6" onSubmit={handleRegister}>
            {error && <div className="text-red-500 text-sm bg-red-500/10 p-3 rounded">{error}</div>}
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-black/10 dark:border-white/10 rounded-md shadow-sm placeholder-neutral-500 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white dark:bg-[#111111] text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-black/10 dark:border-white/10 rounded-md shadow-sm placeholder-neutral-500 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white dark:bg-[#111111] text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white dark:text-black bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                Register
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/10 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-[#111111] text-neutral-500">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex justify-center py-2 px-4 border border-black/10 dark:border-white/10 rounded-md shadow-sm bg-black/5 dark:bg-white/5 text-sm font-medium text-neutral-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10"
              >
                Google
              </button>
            </div>
          </div>
          
          <div className="mt-6 text-center">
             <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Already have an account? <Link href="/login" className="text-emerald-600 hover:text-emerald-700">Sign in</Link>
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
