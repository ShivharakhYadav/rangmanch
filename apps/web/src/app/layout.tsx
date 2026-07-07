import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Rangmanch — Theatre & Event Tickets',
  description: 'Book tickets for theatre shows, concerts, and live events across India.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AuthProvider>
          <SiteHeader />
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
