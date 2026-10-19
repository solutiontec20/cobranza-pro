import { InjectionToken } from "@angular/core";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { appEnv } from "../config/app-env";
import { Database } from "./database.types";

export const SUPABASE = new InjectionToken<SupabaseClient>(
  "SUPABASE",
  {
    providedIn: "root",
    factory: () => createClient<Database>(
      appEnv.supabaseUrl,
      appEnv.supabasePublishableKey
    )
  }
)
