import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sur-Ron · Parts Explorer',
  description:
    'Interactive motorcycle assembly explorer and local model-mapping workbench. Demonstration geometry; mechanical data awaits verification.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
