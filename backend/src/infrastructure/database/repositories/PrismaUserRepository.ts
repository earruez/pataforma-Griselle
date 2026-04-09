import { User, CreateUserInput } from '../../../domain/entities/User';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { prisma } from '../prisma.client';

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string, organizationId: string): Promise<User | null> {
    const row = await prisma.user.findFirst({ where: { id, organizationId } });
    return row as User | null;
  }

  async findByEmail(email: string, organizationId: string): Promise<User | null> {
    const row = await prisma.user.findFirst({ where: { email, organizationId } });
    return row as User | null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await prisma.user.create({ data: input });
    return row as User;
  }

  async update(
    id: string,
    organizationId: string,
    input: Partial<Pick<User, 'name' | 'role' | 'isActive' | 'licenseNumber' | 'licenseExpiry'>>,
  ): Promise<User> {
    const row = await prisma.user.update({
      where: { id, organizationId } as never,
      data: input,
    });
    return row as User;
  }
}
