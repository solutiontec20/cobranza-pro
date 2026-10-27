import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isSixDigitPin } from '../_shared/pin.ts';

type LoginBody = {
  dni?: unknown;
  pin?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function isEightDigitDni(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8}$/.test(value);
}

// Generic message for both "DNI does not exist" and "PIN incorrect" so this
// endpoint never becomes a user-enumeration oracle.
const INVALID_CREDENTIALS_MESSAGE = 'DNI o PIN incorrecto.';

export default {
  // No JWT exists yet at this point -- this is the pre-authentication login
  // request itself. See supabase/config.toml: this function is the only one
  // configured with verify_jwt = false.
  fetch: withSupabase({ auth: 'none' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
    }

    let body: LoginBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'INVALID_JSON' });
    }

    if (!isEightDigitDni(body.dni) || !isSixDigitPin(body.pin)) {
      return jsonResponse(400, {
        error: 'LOGIN_FORMAT_INVALID',
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    const dni = body.dni;
    const pin = body.pin;
    const email = `${dni}@auth.cobranzapro.local`;

    // Look up the profile with the admin client (bypasses RLS, since there is
    // no session yet) purely to check the lockout state before spending a
    // GoTrue password check. If the DNI does not exist we fall through to a
    // real signInWithPassword attempt below, which fails with the same
    // generic message GoTrue would give anyway -- no extra branching that
    // could leak whether the DNI exists.
    const { data: profile } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id, active, pin_locked_at')
      .eq('dni', dni)
      .maybeSingle();

    if (profile?.pin_locked_at) {
      return jsonResponse(423, {
        error: 'ACCOUNT_LOCKED',
        message:
          'Tu cuenta fue bloqueada por varios intentos fallidos. Contactá al administrador para que te asigne un PIN nuevo.',
      });
    }

    const { data, error } = await ctx.supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    const loginSucceeded = !error && !!data.user && !!data.session;

    // Only count attempts for a profile we actually know about and that is
    // not already excluded from the lockout machinery (e.g. inactive
    // accounts are rejected downstream by the frontend, not here).
    let justLocked = false;
    if (profile?.active) {
      const { data: attemptRows, error: recordError } = await ctx.supabaseAdmin.rpc(
        'service_record_login_attempt',
        { p_profile_id: profile.id, p_success: loginSucceeded },
      );

      if (recordError) {
        console.error('login: failed to record login attempt', {
          profileId: profile.id,
          code: recordError.code,
        });
      } else {
        justLocked = attemptRows?.[0]?.locked === true;
      }
    }

    if (!loginSucceeded) {
      if (justLocked) {
        return jsonResponse(423, {
          error: 'ACCOUNT_LOCKED',
          message:
            'Tu cuenta fue bloqueada por varios intentos fallidos. Contactá al administrador para que te asigne un PIN nuevo.',
        });
      }

      return jsonResponse(401, {
        error: 'INVALID_CREDENTIALS',
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    return jsonResponse(200, {
      user: { id: data.user.id },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  }),
};
