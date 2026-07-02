import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MUN Research Tool',
  description: 'Executive Board research tool — generate deep, sourced country position research for any MUN committee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
