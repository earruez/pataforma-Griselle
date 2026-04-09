import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { env } from '../../config/env';
import { PublicUser } from '../../domain/entities/User';

export interface LoginInput {
  email: string;
  password: string;
  organizationId: string;
}

export interface LoginOutput {
  token: string;
  user: PublicUser;
}

export class LoginUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmail(input.email, input.organizationId);

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    const { passwordHash: _, ...publicUser } = user;
    return { token, user: publicUser };
  }
}
