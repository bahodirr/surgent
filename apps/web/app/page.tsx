"use client";
import { useEffect, useState } from 'react';
import { Github, Twitter, ArrowRight } from 'lucide-react';
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

// Typing placeholder hook
function useTypingPlaceholder(placeholders: string[], typingSpeed = 50, pauseDuration = 2000) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const currentPlaceholder = placeholders[currentIndex]!;
    
    if (isTyping) {
      if (displayText.length < currentPlaceholder.length) {
        const timeout = setTimeout(() => {
          setDisplayText(currentPlaceholder.slice(0, displayText.length + 1));
        }, typingSpeed);
        return () => clearTimeout(timeout);
      } else {
        const timeout = setTimeout(() => setIsTyping(false), pauseDuration);
        return () => clearTimeout(timeout);
      }
    } else {
      if (displayText.length > 0) {
        const timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, typingSpeed / 2);
        return () => clearTimeout(timeout);
      } else {
        setCurrentIndex((prev) => (prev + 1) % placeholders.length);
        setIsTyping(true);
      }
    }
  }, [displayText, currentIndex, isTyping, placeholders, typingSpeed, pauseDuration]);

  return displayText;
}

const typingPlaceholders = [
  "Build a CRM for freelance photographers...",
  "Build a habit tracker for students...",
  "Build an invoicing app for freelancers...",
  "Build a booking system for salons...",
];

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
      <div className="rounded-md overflow-hidden border border-border">
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
        <CardTitle className="text-base sm:text-lg text-foreground">
          {template.title}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
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
  const typingPlaceholder = useTypingPlaceholder(typingPlaceholders);

  useEffect(() => {
    const load = async () => {
      const { data } = await authClient.getSession();
      setIsLoggedIn(!!data?.user);
    };
    load();
  }, []);

  const projectTypes: Record<string, { name: string; githubUrl: string; initConvex: boolean }> = {
    fullstack: { name: 'Fullstack', githubUrl: 'https://github.com/bahodirr/worker-vite-react-template', initConvex: true },
    landing: { name: 'Landing', githubUrl: 'https://github.com/bahodirr/web-landing-starter', initConvex: false },
    simple: { name: 'Utility', githubUrl: 'https://github.com/bahodirr/worker-vite-react-simple-template', initConvex: false },
  };

  const handlePromptSend = (text: string, files?: FileList, projectType = 'simple') => {
    const initial = text.trim();
    if (!initial) return;
    
    if (isLoggedIn) {
      toast.loading('Creating your project…', { id: 'create-project' });
      const config = projectTypes[projectType] || projectTypes.simple!;
      const { name, githubUrl, initConvex } = config;
      
      create.mutate(
        { 
          name: `${name} Website ${new Date().toLocaleDateString()}`, 
          githubUrl,
          initConvex 
        },
        {
          onSuccess: ({ id }) => {
            toast.success('Project created!', { id: 'create-project' });
            const q = new URLSearchParams({ initial }).toString();
            router.push(`/project/${id}?${q}`);
          },
          onError: (error) => toast.error(error instanceof Error ? error.message : String(error), { id: 'create-project' }),
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Floating orbs in background */}
      <motion.div
        className="absolute top-20 left-10 w-72 h-72 bg-brand/10 rounded-full blur-3xl"
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
        className="absolute bottom-20 right-10 w-96 h-96 bg-brand/10 rounded-full blur-3xl"
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
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-muted/20" />
      
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
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/surgent-logo.svg"
                alt="Surgent"
                width={119}
                height={32}
                className="h-8 w-auto"
                priority
              />
            </Link>
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
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-18">
          <div className="max-w-4xl w-full space-y-16">
            {/* Hero text */}
            <div className="text-center space-y-6">
              {/* 2-line headline */}
              <div className="space-y-2">
                <motion.h1 
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                >
                  Build something people want.
                </motion.h1>
                <motion.h1 
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-brand inline-flex flex-wrap items-center justify-center gap-3"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  Monetize it instantly
                  <motion.span
                    className="inline-block"
                    animate={{
                      y: [0, -6, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                    style={{
                      filter: 'drop-shadow(0 0 12px rgba(99, 102, 241, 0.6))',
                    }}
                  >
                    <Image
                      src="/surgent-coin.svg"
                      alt="Coin"
                      width={56}
                      height={56}
                      className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14"
                    />
                  </motion.span>
                </motion.h1>
              </div>

              {/* Subheadline */}
              <motion.p 
                className="text-lg md:text-xl text-muted-foreground font-normal max-w-2xl mx-auto leading-relaxed"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                Vibe-code apps. We handle hosting & payments.
              </motion.p>

              {/* Prompt Box */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="max-w-xl mx-auto w-full pt-4 space-y-4"
              >
                <div className="relative">
                  <ChatComposer
                    onSend={handlePromptSend}
                    placeholder={typingPlaceholder || "What do you want to build?"}
                    disabled={create.isPending}
                    value={promptValue}
                    onValueChange={setPromptValue}
                  />
                  {create.isPending && (
                    <div className="absolute inset-0 rounded-xl bg-background/60 backdrop-blur-sm flex items-center justify-center border border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 border-2 border-brand-foreground border-t-transparent rounded-full animate-spin" />
                        Creating your project… Give us a sec
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Trust line */}
                <motion.p
                  className="text-xs sm:text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                >
                  No credit card required · Free to start
                </motion.p>
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
                <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
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
