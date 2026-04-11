import { apiClient } from './client';

export interface LoginPayload { email: string; password: string; organizationId: string; }
export interface AuthUser { id: string; email: string; name: string; role: string; organizationId: string; }

export const authApi = {
  login: async (payload: LoginPayload): Promise<{ token: string; user: AuthUser }> => {
    const { data } = await apiClient.post<{ status: string; data: { token: string; user: AuthUser } }>('/auth/login', { email: payload.email, password: payload.password, organization: payload.organizationId });
    return data.data;
  },

  /** Validates that the stored session's organizationId still exists in the DB.
   *  Returns the current user or throws a 401, which the response interceptor
   *  will catch to auto-clear the session and redirect to /login. */
  me: async (): Promise<AuthUser> => {
    const { data } = await apiClient.get<{ status: string; data: AuthUser }>('/auth/me');
    return data.data;
  },
};
