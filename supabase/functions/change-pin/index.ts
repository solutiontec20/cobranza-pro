import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isSixDigitPin, isWeakPin } from '../_shared/pin.ts';

type ChangePinBody = {
  currentPin?: unknown;
  newPin?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
    }

    let body: ChangePinBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'INVALID_JSON' });
    }

    if (!isSixDigitPin(body.currentPin) || !isSixDigitPin(body.newPin)) {
      return jsonResponse(400, {
        error: 'PIN_FORMAT_INVALID',
        message: 'El PIN debe contener exactamente 6 dígitos.',
      });
    }

    if (body.currentPin === body.newPin) {
      return jsonResponse(400, {
        error: 'PIN_REUSE_NOT_ALLOWED',
        message: 'El PIN nuevo debe ser diferente al actual.',
      });
    }

    const userId = ctx.userClaims!.id;
    const { data: profile, error: profileError } = await ctx.supabase
      .from('profiles')
      .select('dni, role, active, pin_locked_until')
      .eq('id', userId)
      .single();

    if (profileError || !profile || !profile.active) {
      return jsonResponse(403, {
        error: 'ACTIVE_PROFILE_REQUIRED',
        message: 'Solo un usuario activo puede cambiar su PIN.',
      });
    }

    if (profile.role === 'collector') {
      const { data: accessRows, error: accessError } =
        await ctx.supabase.rpc('current_access_status');
      const accessStatus = accessRows?.[0];

      if (accessError || !accessStatus) {
        return jsonResponse(503, {
          error: 'ACCESS_STATUS_UNAVAILABLE',
          message: 'No se pudo verificar el horario de acceso. Intentá nuevamente.',
        });
      }

      if (!accessStatus.allowed) {
        return jsonResponse(403, {
          error: 'COLLECTOR_ACCESS_CLOSED',
          message: 'El acceso para cobradores está disponible de 7:00 a. m. a 8:00 p. m.',
        });
      }
    }

    if (isWeakPin(body.newPin, profile.dni)) {
      return jsonResponse(400, {
        error: 'PIN_TOO_WEAK',
        message: 'Elegí un PIN que no sea secuencial, repetido ni parte de tu DNI.',
      });
    }

    if (profile.pin_locked_until && new Date(profile.pin_locked_until).getTime() > Date.now()) {
      return jsonResponse(400, {
        error: 'CURRENT_PIN_INVALID',
        message: 'El PIN actual no es correcto.',
      });
    }

    // Supabase CLI does not currently expose the hosted setting that makes
    // current_password mandatory. A fresh password sign-in enforces the
    // current PIN server-side and also benefits from Auth rate limiting.
    const { error: verificationError } = await ctx.supabase.auth.signInWithPassword({
      email: `${profile.dni}@auth.cobranzapro.local`,
      password: body.currentPin,
    });

    if (verificationError) {
      const { error: recordError } = await ctx.supabaseAdmin.rpc('service_record_login_attempt', {
        p_profile_id: userId,
        p_success: false,
      });

      if (recordError) {
        console.error('change-pin: failed to record PIN verification', {
          userId,
          code: recordError.code,
        });
      }

      return jsonResponse(400, {
        error: 'CURRENT_PIN_INVALID',
        message: 'El PIN actual no es correcto.',
      });
    }

    const { error: resetAttemptsError } = await ctx.supabaseAdmin.rpc(
      'service_record_login_attempt',
      { p_profile_id: userId, p_success: true },
    );

    if (resetAttemptsError) {
      console.error('change-pin: failed to reset PIN attempts', {
        userId,
        code: resetAttemptsError.code,
      });

      await ctx.supabase.auth.signOut({ scope: 'local' });
      return jsonResponse(503, {
        error: 'PIN_ATTEMPT_STATE_UNAVAILABLE',
        message: 'No se pudo verificar el estado del PIN. Intentá nuevamente.',
      });
    }

    const { error: authError } = await ctx.supabase.auth.updateUser({
      password: body.newPin,
      current_password: body.currentPin,
    });

    // The verification session exists only inside this request. Revoke its
    // refresh token after the Auth update attempt.
    const { error: signOutError } = await ctx.supabase.auth.signOut({ scope: 'local' });
    if (signOutError) {
      console.warn('change-pin: verification session cleanup failed', {
        userId,
        status: signOutError.status,
        code: signOutError.code,
      });
    }

    if (authError) {
      console.error('change-pin: password update failed', {
        userId,
        status: authError.status,
        code: authError.code,
      });

      return jsonResponse(400, {
        error: 'CURRENT_PIN_INVALID',
        message: 'El PIN actual no es correcto.',
      });
    }

    const { error: completionError } = await ctx.supabaseAdmin.rpc('service_complete_pin_change', {
      p_user_id: userId,
    });

    if (completionError) {
      console.error('change-pin: profile completion failed', {
        userId,
        code: completionError.code,
      });

      return jsonResponse(500, {
        error: 'PIN_CHANGE_COMPLETION_FAILED',
        message: 'El PIN cambió, pero no se pudo habilitar el acceso. Contactá al administrador.',
      });
    }

    return jsonResponse(200, { changed: true });
  }),
};
