'use client';

import { PricingTable } from 'autumn-js/react';

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-6xl">
      <h1 className="text-3xl font-bold mb-4">Billing</h1>
      <p className="text-muted-foreground mb-6">
        Upgrade to Pro using checkout.
      </p>

      <div className="space-y-4">
        <PricingTable />
      </div>
    </div>
  );
}
