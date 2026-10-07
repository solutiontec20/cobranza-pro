import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStoreService } from '../../core/services/app-store.service';
import { Profile } from '../../core/models/profile.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private store = inject(AppStoreService);
  private router = inject(Router);
  
  private _currentUser = signal<Profile | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = computed(() => this._currentUser()?.role === 'ADMINISTRADOR');
  readonly isCollector = computed(() => this._currentUser()?.role === 'COBRADOR');
  
  login(dni: string, pin: string): { success: boolean; error?: string } {
    const profiles = this.store.profiles();
    const profile = profiles.find(p => p.dni === dni && p.pin === pin && p.active);
    if (!profile) return { success: false, error: 'DNI o PIN incorrecto' };
    this._currentUser.set(profile);
    return { success: true };
  }
  
  logout(): void {
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }
  
  // For demo quick-switch
  switchUser(profileId: string): boolean {
    const profile = this.store.profiles().find(p => p.id === profileId);
    if (!profile) return false;
    this._currentUser.set(profile);
    return true;
  }
}
