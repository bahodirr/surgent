import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-light mb-8">Privacy Policy</h1>
          
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">1. Information We Collect</h2>
            <p className="text-foreground/80 leading-relaxed">
              We collect information you provide directly to us, including your name, email address, and any content you create using Surgent.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-foreground/80 leading-relaxed">
              We use the information we collect to provide, maintain, and improve our services, and to communicate with you about updates and features.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">3. Data Storage</h2>
            <p className="text-foreground/80 leading-relaxed">
              Your data is stored securely and we implement appropriate technical and organizational measures to protect it.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">4. Third-Party Services</h2>
            <p className="text-foreground/80 leading-relaxed">
              We use third-party services including authentication providers and AI services. These services have their own privacy policies.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">5. Your Rights</h2>
            <p className="text-foreground/80 leading-relaxed">
              You have the right to access, correct, or delete your personal information. Contact us to exercise these rights.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">6. Changes to This Policy</h2>
            <p className="text-foreground/80 leading-relaxed">
              We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-light mt-8 mb-4">7. Contact</h2>
            <p className="text-foreground/80 leading-relaxed">
              For questions about this Privacy Policy, please contact us through our GitHub repository.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}

