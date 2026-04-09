import { User, CreateUserInput } from '../entities/User';

export interface IUserRepository {
  findById(id: string, organizationId: string): Promise<User | null>;
  findByEmail(email: string, organizationId: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(
    id: string,
    organizationId: string,
    input: Partial<Pick<User, 'name' | 'role' | 'isActive' | 'licenseNumber' | 'licenseExpiry'>>,
  ): Promise<User>;
}
