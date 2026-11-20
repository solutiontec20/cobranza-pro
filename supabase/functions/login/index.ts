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
const ACCESS_CLOSED_MESSAGE =
  'El acceso para cobradores está disponible de 7:00 a. m. a 8:00 p. m.';

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

    // The cooldown response is deliberately indistinguishable from an unknown
    // DNI or a wrong PIN so this lookup cannot become an enumeration oracle.
    const { data: profile } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id, active, pin_locked_until')
      .eq('dni', dni)
      .maybeSingle();

    if (profile?.pin_locked_until && new Date(profile.pin_locked_until).getTime() > Date.now()) {
      return jsonResponse(401, {
        error: 'INVALID_CREDENTIALS',
        message: INVALID_CREDENTIALS_MESSAGE,
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
    if (profile?.active) {
      const { error: recordError } = await ctx.supabaseAdmin.rpc('service_record_login_attempt', {
        p_profile_id: profile.id,
        p_success: loginSucceeded,
      });

      if (recordError) {
        console.error('login: failed to record login attempt', {
          profileId: profile.id,
          code: recordError.code,
        });
      }
    }

    if (!loginSucceeded) {
      return jsonResponse(401, {
        error: 'INVALID_CREDENTIALS',
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    // Credentials are valid at this point. Check the database-owned access
    // policy only now so this endpoint cannot reveal a profile's role before
    // authentication succeeds.
    const { data: accessRows, error: accessError } =
      await ctx.supabase.rpc('current_access_status');
    const accessStatus = accessRows?.[0];

    if (accessError || !accessStatus) {
      await ctx.supabase.auth.signOut({ scope: 'local' });
      return jsonResponse(503, {
        error: 'ACCESS_STATUS_UNAVAILABLE',
        message: 'No se pudo verificar el horario de acceso. Intentá nuevamente.',
      });
    }

    if (profile?.active && accessStatus.role === 'collector' && !accessStatus.allowed) {
      await ctx.supabase.auth.signOut({ scope: 'local' });
      return jsonResponse(403, {
        error: 'COLLECTOR_ACCESS_CLOSED',
        message: ACCESS_CLOSED_MESSAGE,
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
