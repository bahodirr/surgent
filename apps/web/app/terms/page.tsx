import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <article className="prose prose-zinc dark:prose-invert max-w-none">
          <h1 className="text-4xl font-light mb-8">Terms of Service</h1>
          
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-foreground/80 leading-relaxed">
              By accessing and using Surgent, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">2. Use License</h2>
            <p className="text-foreground/80 leading-relaxed">
              Permission is granted to temporarily use Surgent for personal, non-commercial transitory viewing only.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">3. Service Description</h2>
            <p className="text-foreground/80 leading-relaxed">
              Surgent provides AI-powered website building tools. We reserve the right to modify or discontinue the service at any time.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">4. User Responsibilities</h2>
            <p className="text-foreground/80 leading-relaxed">
              You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">5. Limitation of Liability</h2>
            <p className="text-foreground/80 leading-relaxed">
              Surgent shall not be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of the service.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">6. Contact</h2>
            <p className="text-foreground/80 leading-relaxed">
              For questions about these Terms, please contact us through our GitHub repository.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}

