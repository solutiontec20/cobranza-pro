import { withSupabase } from 'npm:@supabase/server@1';
import { isWeakPin } from '../_shared/pin.ts';

type CreateCollectorBody = {
  fullName?: unknown;
  dni?: unknown;
  phone?: unknown;
  temporaryPin?: unknown;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
) {
  return Response.json(body, { status });
}

function validationError(
  body: CreateCollectorBody,
): string | null {
  if (
    typeof body.fullName !== 'string' ||
    body.fullName.trim().length < 3
  ) {
    return 'El nombre debe tener al menos 3 caracteres.';
  }

  if (
    typeof body.dni !== 'string' ||
    !/^\d{8}$/.test(body.dni)
  ) {
    return 'El DNI debe contener 8 dígitos.';
  }

  if (
    body.phone !== undefined &&
    body.phone !== null &&
    body.phone !== '' &&
    (
      typeof body.phone !== 'string' ||
      !/^9\d{8}$/.test(body.phone)
    )
  ) {
    return 'El teléfono debe contener 9 dígitos e iniciar en 9.';
  }

  if (
    typeof body.temporaryPin !== 'string' ||
    !/^\d{6}$/.test(body.temporaryPin)
  ) {
    return 'El PIN temporal debe contener 6 dígitos.';
  }

  return null;
}

export default {
  fetch: withSupabase(
    {
      auth: 'user',
    },
    async (request, ctx) => {
      if (request.method !== 'POST') {
        return jsonResponse(405, {
          error: 'METHOD_NOT_ALLOWED',
        });
      }

      let body: CreateCollectorBody;

      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, {
          error: 'INVALID_JSON',
        });
      }

      const invalidMessage =
        validationError(body);

      if (invalidMessage) {
        return jsonResponse(400, {
          error: 'VALIDATION_ERROR',
          message: invalidMessage,
        });
      }

      const userId = ctx.userClaims!.id;

      // ------------------------------------------------------
      // AUTORIZACIÓN DE NEGOCIO
      // ------------------------------------------------------

      const {
        data: callerProfile,
        error: profileError,
      } = await ctx.supabase
        .from('profiles')
        .select('role, active')
        .eq('id', userId)
        .single();

      if (
        profileError ||
        !callerProfile ||
        !callerProfile.active ||
        callerProfile.role !== 'admin'
      ) {
        return jsonResponse(403, {
          error: 'ADMIN_REQUIRED',
        });
      }

      // ------------------------------------------------------
      // DATOS NORMALIZADOS
      // ------------------------------------------------------

      const dni =
        (body.dni as string).trim();

      const fullName =
        (body.fullName as string).trim();

      const temporaryPin =
        body.temporaryPin as string;

      if (isWeakPin(temporaryPin, dni)) {
        return jsonResponse(400, {
          error: 'PIN_TOO_WEAK',
          message: 'Elegí un PIN que no sea secuencial, repetido ni parte del DNI.',
        });
      }

      const phone =
        typeof body.phone === 'string' &&
        body.phone.trim() !== ''
          ? body.phone.trim()
          : null;

      const email =
        `${dni}@auth.cobranzapro.local`;

      // ------------------------------------------------------
      // CREAR USUARIO EN SUPABASE AUTH
      //
      // ctx.supabaseAdmin usa la Secret Key.
      // Nunca sale al navegador.
      // ------------------------------------------------------

      const {
        data: created,
        error: createUserError,
      } =
        await ctx.supabaseAdmin.auth.admin.createUser({
          email,
          password: temporaryPin,
          email_confirm: true,
        });

      if (
        createUserError ||
        !created.user
      ) {
        console.error(
          'admin-create-collector: auth user creation failed',
          {
            status:
              createUserError?.status,
            code:
              createUserError?.code,
          },
        );

        return jsonResponse(409, {
          error:
            'COLLECTOR_AUTH_CREATION_FAILED',
          message:
            'No se pudo crear el acceso. Verificá que el DNI no esté registrado.',
        });
      }

      // ------------------------------------------------------
      // CREAR PERFIL DE NEGOCIO
      //
      // Usamos ctx.supabase deliberadamente:
      // ejecuta la RPC como el admin autenticado.
      // La RPC también debe validar el rol.
      // ------------------------------------------------------

      const {
        data: rows,
        error: rpcError,
      } = await ctx.supabase.rpc(
        'admin_create_collector_profile',
        {
          p_user_id: created.user.id,
          p_dni: dni,
          p_full_name: fullName,
          p_phone: phone,
        },
      );

      // ------------------------------------------------------
      // COMPENSACIÓN
      //
      // Si Auth funcionó pero la creación del profile falla,
      // eliminamos el usuario Auth para no dejarlo huérfano.
      // ------------------------------------------------------

      if (
        rpcError ||
        !rows?.[0]
      ) {
        const {
          error: compensationError,
        } =
          await ctx.supabaseAdmin.auth.admin.deleteUser(
            created.user.id,
          );

        if (compensationError) {
          console.error(
            'admin-create-collector: compensation failed',
            {
              userId:
                created.user.id,
              status:
                compensationError.status,
              code:
                compensationError.code,
            },
          );
        }

        console.error(
          'admin-create-collector: profile creation failed',
          {
            code: rpcError?.code,
          },
        );

        return jsonResponse(409, {
          error:
            'COLLECTOR_PROFILE_CREATION_FAILED',
          message:
            'No se pudo completar el registro. Verificá que el DNI no esté registrado.',
        });
      }

      return jsonResponse(201, {
        collector: rows[0],
      });
    },
  ),
};
