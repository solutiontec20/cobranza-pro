import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { generateTemporaryPin } from '../_shared/pin.ts';

type ResetPinBody = {
  collectorId?: unknown;
  reason?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
    }

    let body: ResetPinBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'INVALID_JSON' });
    }

    if (typeof body.collectorId !== 'string' || body.collectorId.length === 0) {
      return jsonResponse(400, {
        error: 'COLLECTOR_REQUIRED',
        message: 'Seleccioná un cobrador.',
      });
    }

    if (typeof body.reason !== 'string' || body.reason.trim().length < 5) {
      return jsonResponse(400, {
        error: 'RESET_REASON_INVALID',
        message: 'Detallá el motivo en al menos 5 caracteres.',
      });
    }

    const actorId = ctx.userClaims!.id;
    const { data: actor, error: actorError } = await ctx.supabase
      .from('profiles')
      .select('role, active')
      .eq('id', actorId)
      .single();

    if (actorError || !actor || !actor.active || actor.role !== 'admin') {
      return jsonResponse(403, {
        error: 'ADMIN_REQUIRED',
        message: 'Solo un administrador activo puede restablecer el PIN.',
      });
    }

    const { data: rows, error: prepareError } = await ctx.supabase.rpc(
      'admin_prepare_collector_pin_reset',
      {
        p_collector_id: body.collectorId,
        p_reason: body.reason.trim(),
      },
    );

    const collector = rows?.[0];
    if (prepareError || !collector) {
      console.error('admin-reset-collector-pin: reset preparation failed', {
        actorId,
        collectorId: body.collectorId,
        code: prepareError?.code,
      });

      return jsonResponse(409, {
        error: 'PIN_RESET_PREPARATION_FAILED',
        message: prepareError?.message === 'ACTIVE_COLLECTOR_NOT_FOUND'
          ? 'El cobrador no existe o está inactivo.'
          : 'No se pudo preparar el restablecimiento del PIN.',
      });
    }

    const temporaryPin = generateTemporaryPin(collector.dni);
    const { error: authError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
      collector.id,
      { password: temporaryPin },
    );

    if (authError) {
      console.error('admin-reset-collector-pin: auth password update failed', {
        actorId,
        collectorId: collector.id,
        status: authError.status,
        code: authError.code,
      });

      return jsonResponse(502, {
        error: 'COLLECTOR_AUTH_RESET_FAILED',
        message: 'No se pudo restablecer el PIN. El acceso quedó bloqueado hasta volver a intentarlo.',
      });
    }

    return jsonResponse(200, {
      collectorId: collector.id,
      collectorName: collector.full_name,
      temporaryPin,
    });
  }),
};

