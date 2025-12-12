"use client";
import { useEffect, useState } from 'react';
import { Github, Twitter } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { ChatComposer } from '@/components/chat/chat-composer';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/queries/projects';
import { toast, Toaster } from 'react-hot-toast';

const templates = [
  {
    id: 'landing-page',
    title: 'Landing Page',
    description: 'Beautiful, responsive landing page with modern design. Great for product launches.',
    image: '/landing-template.png',
    gitRepo: 'https://github.com/bahodirr/web-landing-starter',
    initConvex: false,
  },
  {
    id: 'portfolio',
    title: 'Personal Website',
    description: 'Showcase your work with a clean, professional portfolio site. Perfect for creatives.',
    image: '/personal-website.png',
    gitRepo: 'https://github.com/bahodirr/surgent-template-portfolio',
    initConvex: false,
  },
  {
    id: '3d-apps',
    title: '3D Interactive App',
    description: 'Modern 3D application with interactive elements. Perfect for immersive experiences.',
    image: '/3d-apps.png',
    gitRepo: 'https://github.com/bahodirr/surgent-template-3d',
    initConvex: false,
  },
  {
    id: 'utility-app',
    title: 'Utility App',
    description: 'Practical tools like calculators, converters, task managers, or note apps. Includes data persistence and real-time features.',
    image: '/c4e_raw_note_transformer.svg',
    gitRepo: 'https://github.com/bahodirr/surgent-template-utility',
    initConvex: true,
  },
 
];

// Simple Template Card Component
function TemplateCard({ template }: { template: typeof templates[0] }) {
  return (
    <Card className="border-0 p-0 shadow-none bg-transparent rounded-xs">
      <div className="rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <Image
          src={template.image}
          alt={template.title}
          width={1200}
          height={750}
          sizes="(min-width: 1280px) 28vw, (min-width: 768px) 40vw, 80vw"
          className="w-full h-auto"
        />
      </div>
      <CardContent className="px-0 pt-3 space-y-1.5">
        <CardTitle className="text-base sm:text-lg text-zinc-900 dark:text-zinc-100">
          {template.title}
        </CardTitle>
        <CardDescription className="text-zinc-600 dark:text-zinc-400">
          {template.description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

export default function Index() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [promptValue, setPromptValue] = useState('');
  const router = useRouter();
  const create = useCreateProject();

  useEffect(() => {
    const load = async () => {
      const { data } = await authClient.getSession();
      setIsLoggedIn(!!data?.user);
    };
    load();
  }, []);

  const handlePromptSend = (text: string, files?: FileList, projectType?: string) => {
    const initial = text.trim();
    if (!initial) return;
    
    if (isLoggedIn) {
      // show loading toast and start project creation
      toast.loading('Creating your project…', { id: 'create-project' });
      const isFullstack = projectType === 'fullstack';
      console.log('projectType', projectType, isFullstack);
      const githubUrl = isFullstack
        ? 'https://github.com/bahodirr/worker-vite-react-template'
        : 'https://github.com/bahodirr/web-landing-starter';
      create.mutate(
        { 
          name: `${isFullstack ? 'Fullstack' : 'Simple'} Website ${new Date().toLocaleDateString()}`, 
          githubUrl,
          initConvex: isFullstack 
        },
        {
          onSuccess: ({ id }) => {
            toast.success('Project created!', { id: 'create-project' });
            const q = new URLSearchParams({ initial }).toString();
            router.push(`/project/${id}?${q}`);
          },
          onError: () => toast.error('Failed to create project. Please try again.', { id: 'create-project' }),
        }
      );
    } else {
      const q = new URLSearchParams({ initial }).toString();
      const next = `/project/new?${q}`;
      const qp = new URLSearchParams({ next }).toString();
      router.push(`/signup?${qp}`);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 relative overflow-hidden">
      {/* Floating orbs in background */}
      <motion.div
        className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl"
        animate={{
          y: [0, 30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl"
        animate={{
          y: [0, -40, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 10,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      />
      
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-linear-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900" />
      
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
        <motion.header 
          className="w-full px-6 py-6"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
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
        </motion.header>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
          <div className="max-w-4xl w-full space-y-16">
            {/* Hero text */}
            <div className="text-center space-y-6">
              <motion.h1 
                className="text-4xl sm:text-5xl md:text-7xl font-extralight tracking-tighter text-zinc-900 dark:text-zinc-100"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                Build your dream website.
              </motion.h1>
              <motion.p 
                className="text-base md:text-xl text-zinc-500 dark:text-zinc-400 font-light max-w-3xl mx-auto leading-relaxed"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Ask AI to build what you want.
              </motion.p>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="max-w-2xl mx-auto w-full pt-2 space-y-4"
              >
                <div className="relative">
                  <ChatComposer
                    onSend={handlePromptSend}
                    placeholder="What do you want to build today?"
                    disabled={create.isPending}
                    value={promptValue}
                    onValueChange={setPromptValue}
                  />
                  {create.isPending && (
                    <div className="absolute inset-0 rounded-xl bg-background/60 backdrop-blur-sm flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 border-2 border-brand-foreground border-t-transparent rounded-full animate-spin" />
                        Creating your project… Give us a sec
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Try:</span>
                  <button
                    onClick={() => setPromptValue('Please build personal website with linkedin data. Clean yet unique and creative. No ai slop. Comprehensive full web page. Linkedin:')}
                    className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Build personal website
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Templates Section */}
            <div className="space-y-8">
              <motion.div 
                className="text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 tracking-wide uppercase">
                  Things you can build
                </p>
              </motion.div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
                {templates.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                  >
                    <TemplateCard template={template} />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-border/50">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms
                </Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/bahodirr/surgent"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="h-5 w-5" />
                </a>
                <a
                  href="https://twitter.com/benroff_"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Twitter className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
