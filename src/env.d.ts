declare interface Env {
  readonly NODE_ENV: string;

  readonly NG_APP_PRIMENG_UI_KEY: string;
  readonly NG_APP_SUPABASE_URL: string;
  readonly NG_APP_SUPABASE_PUBLISHABLE_KEY: string;

  [key: string]: any;
}

declare interface ImportMeta {
  readonly env: Env;
}

declare const _NGX_ENV_: Env;

declare namespace NodeJS {
  export interface ProcessEnv extends Env {}
}
