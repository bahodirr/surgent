'use client';

import { useState, useRef } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function Index() {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  

  const handleStartBuilding = () => {
    if (!input.trim()) return;
    router.push('/dashboard');
  };

  const handleGetStarted = () => {
    router.push('/dashboard');
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 relative overflow-hidden">
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="tracking-tight">Launching September 5</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">surgent.dev</span> is coming soon.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            We’re putting the finishing touches on the experience. See you on <span className="font-medium text-zinc-900 dark:text-zinc-100">September 5</span>.
          </div>
        </DialogContent>
      </Dialog>
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
            <button
              onClick={handleGetStarted}
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Get Started
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-20">
          <div className="max-w-4xl w-full space-y-16">
            {/* Hero text */}
            <div className="text-center space-y-6">
              <h1 className="text-5xl md:text-7xl font-extralight tracking-tighter text-zinc-900 dark:text-zinc-100">
                Build faster with AI
              </h1>
              <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 font-light max-w-2xl mx-auto">
                Describe what you want. <span className="text-zinc-900 dark:text-zinc-100">surgent.dev</span> turns ideas into working software.
              </p>
              
              {/* Get Started Button */}
              <div className="pt-4">
                <button
                  onClick={handleGetStarted}
                  className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  Get Started
                </button>
              </div>
            </div>

            {/* Input section */}
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStartBuilding();
                }}
                className="relative group"
              >
                <div 
                  className={`
                    relative overflow-hidden rounded-3xl
                    bg-white dark:bg-zinc-900
                    border border-zinc-200 dark:border-zinc-800
                    transition-all duration-300
                    ${isFocused ? 'border-zinc-400 dark:border-zinc-600 shadow-lg shadow-zinc-100 dark:shadow-zinc-950/50' : ''}
                  `}
                >
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      adjustTextareaHeight();
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                        e.preventDefault();
                        handleStartBuilding();
                      }
                    }}
                    placeholder="A todo app with real-time sync..."
                    className="
                      w-full resize-none bg-transparent
                      px-6 py-5
                      text-base md:text-lg
                      text-zinc-900 dark:text-zinc-100
                      placeholder:text-zinc-400 dark:placeholder:text-zinc-600
                      focus:outline-none
                      transition-all duration-300
                    "
                    style={{ 
                      minHeight: '80px',
                      lineHeight: '1.6' 
                    }}
                    rows={1}
                  />
                  
                  <div className="absolute bottom-4 right-4">
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className={`
                        flex items-center gap-2 px-4 py-2
                        rounded-xl text-sm font-medium
                        transition-all duration-200
                        ${input.trim() 
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200' 
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                        }
                      `}
                      aria-label="Start building"
                    >
                      <span>Start</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </form>

              <div className="flex items-center justify-center gap-6 text-xs text-zinc-400 dark:text-zinc-600">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">Enter</kbd>
                  to start
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">Shift</kbd>
                  +
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">Enter</kbd>
                  for new line
                </span>
              </div>
            </div>

            {/* Example prompts */}
            <div className="space-y-3">
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Try these</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'E-commerce dashboard',
                  'Real-time chat app',
                  'Analytics platform',
                  'Project management tool'
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setInput(example);
                      adjustTextareaHeight();
                      textareaRef.current?.focus();
                    }}
                    className="
                      px-3 py-1.5 text-sm
                      rounded-full border border-zinc-200 dark:border-zinc-800
                      text-zinc-600 dark:text-zinc-400
                      hover:border-zinc-300 dark:hover:border-zinc-700
                      hover:text-zinc-900 dark:hover:text-zinc-100
                      transition-colors duration-200
                    "
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 pb-8 text-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            Powered by Claude 3.5 • Built with Next.js
          </p>
        </footer>
      </div>
    </div>
  );
}
