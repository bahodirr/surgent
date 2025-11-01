"use client";
import { useEffect, useState } from 'react';
import { UserPlus, MessageSquare, Rocket, Github, Twitter } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export default function Index() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await authClient.getSession();
      setIsLoggedIn(!!data?.user);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 relative overflow-hidden">
      {/* Removed coming soon dialog */}
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900" />
      
      {/* Dot pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="w-full px-6 py-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <span className="text-lg font-bold tracking-tight">Surgent</span>
            </div>
            {isLoggedIn ? (
              <Button asChild variant="outline" size="sm" className="rounded-full shrink-0 cursor-pointer">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="rounded-full shrink-0 cursor-pointer">
                <Link href="/signup">Sign up</Link>
              </Button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6 md:pt-10">
          <div className="max-w-4xl w-full space-y-10">
            {/* Hero text */}
            <div className="text-center space-y-6">
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center rounded-full font-medium border px-2.5 py-0.5 text-[11px] leading-tight bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-mono">
                  Free during beta
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-extralight tracking-tighter text-zinc-900 dark:text-zinc-100">
                The easiest way to run AI agents in the cloud
              </h1>
              <p className="text-base md:text-xl text-zinc-500 dark:text-zinc-400 font-light max-w-3xl mx-auto leading-relaxed">
                Built for developers who want to ship <span className="text-zinc-800 dark:text-zinc-200 font-medium italic">fast</span>. Agentic development, wherever you are. Fire. Forget. Come back to pull requests.
              </p>
              
              {/* Signup CTA */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                {isLoggedIn ? (
                  <Button asChild size="lg" className="rounded-full cursor-pointer w-full sm:w-auto">
                    <Link href="/dashboard">Go to dashboard</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" className="rounded-full cursor-pointer w-full sm:w-auto">
                    <Link href="/signup">Sign up to get started</Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full w-full sm:w-auto"
                  onClick={() => {
                    const el = document.getElementById('features');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Features
                </Button>
              </div>

              {/* Supported agents */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">Supported agents:</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300">
                  <img alt="Claude Logo" src="/claude-logo.svg" className="inline-block h-4 w-4" />
                  <span>Claude Code</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300">
                  <img alt="OpenAI Logo" src="/OpenAI-logo.svg" className="inline-block h-4 w-4 dark:invert dark:opacity-90" />
                  <span>OpenAI Codex</span>
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">• more coming soon</span>
              </div>
            </div>

            
            {/* Core features */}
            <section id="features" className="max-w-4xl mx-auto py-6 md:py-8">
              <div className="text-center mb-6">
                <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Core features</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40">
                  <div className="mx-auto mb-2 h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Conversational building</div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Describe your app in plain English and iterate naturally.</p>
                </div>
                <div className="text-center p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40">
                  <div className="mx-auto mb-2 h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Rocket className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">AI-powered generation</div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Generate working code and ship faster with confidence.</p>
                </div>
                <div className="text-center p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40">
                  <div className="mx-auto mb-2 h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Simple onboarding</div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Get started in seconds with Google sign-in.</p>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-zinc-200 dark:border-zinc-800">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="col-span-2 md:col-span-1">
                <div className="text-zinc-900 dark:text-zinc-100 text-lg font-semibold tracking-tight">Surgent</div>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Build faster with AI.</p>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Product</div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <button
                      onClick={() => {
                        const el = document.getElementById('features');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    >
                      Features
                    </button>
                  </li>
                  <li>
                    <a href="/dashboard" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Dashboard</a>
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Account</div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="/signup" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Sign up</a>
                  </li>
                  <li>
                    <a href="/login" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Log in</a>
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Legal</div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="/terms" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Terms</a>
                  </li>
                  <li>
                    <a href="/privacy" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Privacy</a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-6">
              <p className="text-xs text-zinc-400 dark:text-zinc-600">© {new Date().getFullYear()} Surgent. All rights reserved.</p>
              <div className="flex items-center gap-2">
                <a
                  href="https://github.com/bahodirr/surgent"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <Github className="h-4 w-4" />
                </a>
                <a
                  href="https://twitter.com/benrov_"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
