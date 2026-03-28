import { api } from "@/shared/api";
import type { TokenPair, User } from "@/shared/types";

export const authApi = {
  login: (username: string, password: string) =>
    api.post<TokenPair>("/api/auth/token/", { username, password }),
  register: (username: string, email: string, password: string, password_confirm: string) =>
    api.post("/api/auth/register/", { username, email, password, password_confirm }),
  me: () => api.get<User>("/api/auth/me/"),
};
