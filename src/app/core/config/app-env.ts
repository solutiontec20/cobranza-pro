function requiredEnv(
  name: string,
  value: string | undefined,
): string {
  if (!value) {
    throw new Error(
      `Se requiere la siguiente variable de entorno: ${name}`,
    );
  }

  return value;
}

export const appEnv = {
  primeNgKey: requiredEnv(
    'NG_APP_PRIMENG_UI_KEY',
    import.meta.env.NG_APP_PRIMENG_UI_KEY,
  ),

  supabaseUrl: requiredEnv(
    'NG_APP_SUPABASE_URL',
    import.meta.env.NG_APP_SUPABASE_URL,
  ),

  supabasePublishableKey: requiredEnv(
    'NG_APP_SUPABASE_PUBLISHABLE_KEY',
    import.meta.env.NG_APP_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
