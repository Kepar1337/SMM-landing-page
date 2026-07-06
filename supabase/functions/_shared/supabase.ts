// Admin-клієнт до БД на service-role ключі. Використовується ТІЛЬКИ всередині
// Edge Functions — ключ ніколи не віддається клієнту.

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { DbEnv } from "./env.ts";

export function adminClient(env: DbEnv) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
