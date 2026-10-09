import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStoreService } from '../../core/services/app-store.service';
import { Profile } from '../../core/models/profile.model';
import { SUPABASE } from '../../core/supabase/supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // INIT CODIGO PRE-PRODUCCION LO QUE ENCAPSULE AQUI  NO TOCAR NI MODIFICAR CON IA - ESTA PARTE QUE LA IA LO IGNORE

  private readonly supabase = inject(SUPABASE)

  async getUser() {
    const { data, error } = await this.supabase.auth.getUser();

    if (error) return null;

    return data.user

  }



  // FIN  CODIGO PRE-PRODUCCION NO TOCAR NI MODIFICAR CON IA - ESTA PARTE QUE LA IA LO IGNORE

  private store = inject(AppStoreService);
  private router = inject(Router);

  private _currentUser = signal<Profile | null>(this.getStoredUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = computed(() => this._currentUser()?.role === 'ADMINISTRADOR');
  readonly isCollector = computed(() => this._currentUser()?.role === 'COBRADOR');

  private getStoredUser(): Profile | null {
    try {
      const stored = localStorage.getItem('cobranzapro_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Error reading user from localStorage', e);
      return null;
    }
  }

  private saveUser(profile: Profile | null) {
    this._currentUser.set(profile);
    if (profile) {
      localStorage.setItem('cobranzapro_user', JSON.stringify(profile));
    } else {
      localStorage.removeItem('cobranzapro_user');
    }
  }

  login(dni: string, pin: string): { success: boolean; error?: string } {
    const profiles = this.store.profiles();
    const profile = profiles.find(p => p.dni === dni && p.pin === pin && p.active);
    if (!profile) return { success: false, error: 'DNI o PIN incorrecto' };
    this.saveUser(profile);
    return { success: true };
  }

  logout(): void {
    this.saveUser(null);
    this.router.navigate(['/login']);
  }

  // For demo quick-switch
  switchUser(profileId: string): boolean {
    const profile = this.store.profiles().find(p => p.id === profileId);
    if (!profile) return false;
    this.saveUser(profile);
    return true;
  }
}
