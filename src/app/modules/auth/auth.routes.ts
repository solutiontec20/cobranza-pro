import { Routes } from "@angular/router";

export const AUTH_ROUTES: Routes = [
  {
    path: "",
    loadComponent: () => import("./auth-layout"),
    children: [
      {
        path: "",
        loadComponent: () => import("./login/login")
      }
    ]
  }
]
