import { inject, Service } from '@angular/core';
import { AuthRepository } from '../repositories/auth.repository';
import { SUPABASE } from '../supabase/supabase-client';
import { Profile } from '../models/profile.model';
import { AppError } from '../errors/app-error';

@Service({
  autoProvided: false
})
export class SupabaseAuthRepository implements AuthRepository {

  private readonly supabase = inject(SUPABASE)


  async login(dni: string, pin: string): Promise<Profile> {

    const email = this.emailFromDni(dni)

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: pin
    })

    if (error || !data.user) {
      throw new AppError("AUTH_INVALID_CREDENTIALS", error?.message ?? 'Credenciales Invalidas', error)
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


  async logout(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      throw new AppError('SUPABASE_RPC', error.message, error);
    }
  }


  private async fetchProfile(userId: string): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,dni,full_name,role,active")
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
    };

  }


  private emailFromDni(dni: string): string {
    return `${dni}@auth.cobranzapro.local`;
  }

}
