import './globals.css';
import Providers from '@/components/providers';
import { Inter, JetBrains_Mono } from 'next/font/google';

export const metadata = {
  title: 'Surgent — Build faster with AI',
  description: 'Describe what you want. surgent.dev turns ideas into working software.',
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased ${inter.variable} ${jetbrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
