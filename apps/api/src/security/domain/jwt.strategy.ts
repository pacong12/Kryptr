import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/**
 * JWT payload interface for authenticated users
 */
export interface JWTPayload {
  userId: string;
  walletId?: string;
  origin?: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT Strategy - validates and decodes JWT tokens
 * Uses HS256 algorithm with secret from environment config
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'kryptr-default-secret-change-in-production'),
      algorithms: ['HS256'],
    });
  }

  /**
   * Validate JWT payload and return user info
   * Throws UnauthorizedException if validation fails
   */
  async validate(payload: JWTPayload): Promise<JWTPayload> {
    // Add additional business logic validation here if needed
    // For example: check user status, wallet ownership, etc.
    
    if (!payload.userId) {
      throw new UnauthorizedException('Invalid JWT payload: missing userId');
    }

    return payload;
  }
}
