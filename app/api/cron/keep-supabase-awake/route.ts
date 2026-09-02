import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  // Vercel sends this automatically when CRON_SECRET is set on the project.
  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
  }

  // Hobby projects may not have CRON_SECRET. Vercel cron requests always
  // use this user agent; still reject random browsers.
  return request.headers.get('user-agent') === 'vercel-cron/1.0';
}

/**
 * Daily keep-alive so a paused GitHub Actions cron cannot take the
 * free-tier Supabase project down with it. One SELECT is enough activity.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase environment variables are not set' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { error } = await supabase.from('matches').select('id').limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
