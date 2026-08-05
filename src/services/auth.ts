import 'server-only';

import { cookies } from 'next/headers';
import { getSession } from './database';
import type { User } from '@/types';

export async function getLoggedInUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session')?.value;
  if (!sessionId) return null;
  return getSession(sessionId)?.user ?? null;
}
