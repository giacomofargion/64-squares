import { LandingPageContent } from '@/components/LandingPageContent';

// Don't prerender this page for days at the CDN. Stale HTML can keep
// pointing at hashed CSS files that a new deploy already deleted, which
// is how 64squares.xyz looked unstyled while the Vercel URL looked fine.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function HomePage() {
  return <LandingPageContent />;
}
