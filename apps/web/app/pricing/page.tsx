'use client';

import { PricingTable } from 'autumn-js/react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-6 max-w-6xl flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <ThemeToggle />
      </header>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold mb-4">Billing</h1>
        <p className="text-muted-foreground mb-6">
          Upgrade to Pro using checkout.
        </p>

        <div className="space-y-4">
          <PricingTable />
        </div>
      </div>
    </div>
  );
}
