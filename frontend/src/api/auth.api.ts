import { apiClient } from './client';

export interface LoginPayload { email: string; password: string; organizationId: string; }
export interface AuthUser { id: string; email: string; name: string; role: string; organizationId: string; }

export const authApi = {
  login: async (payload: LoginPayload): Promise<{ token: string; user: AuthUser }> => {
    const { data } = await apiClient.post<{ status: string; data: { token: string; user: AuthUser } }>('/auth/login', payload);
    return data.data;
  },
};
