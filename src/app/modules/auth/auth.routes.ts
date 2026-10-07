import { Routes } from "@angular/router";

export const AUTH_ROUTES: Routes = [
  {
    path: "login",
    loadComponent: () => import("./login/login")
  }
]
