import { InjectionToken } from "@angular/core"
import { ChangePinInput, Profile } from "../models/profile.model"

export interface AuthRepository {
  login(dni: string, pin: string): Promise<Profile>
  currentUser(): Promise<Profile | null>
  changePin(input: ChangePinInput): Promise<void>
  logout(): Promise<void>
}


export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>("AUTH_REPOSITORY")

