import { inject, Service } from '@angular/core';
import { FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { AuthRepository } from '../repositories/auth.repository';
import { SUPABASE } from '../supabase/supabase-client';
import { ChangePinInput, Profile } from '../models/profile.model';
import { AppError, AppErrorCode } from '../errors/app-error';
import { Database } from '../supabase/database.types';

interface LoginFunctionResponse {
  user: { id: string };
  session: { access_token: string; refresh_token: string };
}

@Service({
  autoProvided: false
})
export class SupabaseAuthRepository implements AuthRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async login(dni: string, pin: string): Promise<Profile> {
    const { data, error } = await this.supabase.functions.invoke<LoginFunctionResponse>(
      'login',
      { body: { dni, pin } },
    );

    if (error || !data?.session || !data.user) {
      throw await this.functionError(error, 'DNI o PIN incorrecto.', 'AUTH_INVALID_CREDENTIALS');
    }

    const { error: sessionError } = await this.supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'No se pudo iniciar sesión.', sessionError);
    }

    const profile = await this.fetchProfile(data.user.id);

    if (!profile.active) {
      await this.logout();
      throw new AppError('AUTH_UNAUTHORIZED', 'Usuario inactivo. Contacte al administrador.');
    }

    return profile;
  }

  
  async currentUser(): Promise<Profile | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) {
      return null;
    }
    return this.fetchProfile(user.id);
  }

  async changePin(input: ChangePinInput): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke<{ changed: boolean }>(
      'change-pin',
      { body: input },
    );

    if (error) {
      throw await this.functionError(error, 'No se pudo cambiar el PIN.');
    }

    if (!data?.changed) {
      throw new AppError('SUPABASE_RPC', 'El cambio de PIN no fue confirmado.');
    }
  }


  async logout(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      throw new AppError('SUPABASE_RPC', error.message, error);
    }
  }


  private async fetchProfile(userId: string): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,dni,full_name,role,active,must_change_pin")
      .eq("id", userId)
      .single()

    if (error || !data) {
      throw new AppError('SUPABASE_RLS', 'No se pudo cargar el perfil del usuario', error);
    }

    return {
      id: data.id,
      dni: data.dni,
      fullName: data.full_name,
      role: data.role,
      active: data.active,
      mustChangePin: data.must_change_pin,
    };

  }


  private async functionError(
    error: unknown,
    fallback: string,
    code: AppErrorCode = 'SUPABASE_RPC',
  ): Promise<AppError> {
    let message = fallback;

    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { message?: string };
        message = body.message ?? message;
      } catch {
        // Infrastructure errors may return an empty response.
      }
    }

    return new AppError(code, message, error);
  }

}
