import { InjectionToken } from "@angular/core";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { appEnv } from "../config/app-env";

export const SUPABASE = new InjectionToken<SupabaseClient>(
  "SUPABASE",
  {
    providedIn: "root",
    factory: () => createClient(
      appEnv.supabaseUrl,
      appEnv.supabasePublishableKey
    )
  }
)
