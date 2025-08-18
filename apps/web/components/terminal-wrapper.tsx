'use client';

import dynamic from 'next/dynamic';

const Terminal = dynamic(() => import('@/components/terminal-clean'), {
  ssr: false,
  loading: () => <div className="text-white p-4">Loading terminal...</div>
});

export default function TerminalWrapper() {
  return <Terminal />;
}