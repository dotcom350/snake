import { describe, it, expect } from 'vitest';
import {
  InputIntentSchema,
  JoinRoomSchema,
  AdminLoginSchema,
  AdminConfigSchema,
} from './schemas.js';

describe('Schemas', () => {
  describe('InputIntentSchema', () => {
    it('should validate correct input', () => {
      const input = {
        direction: 1,
        boost: false,
        timestamp: Date.now(),
      };
      expect(() => InputIntentSchema.parse(input)).not.toThrow();
    });

    it('should reject invalid direction', () => {
      expect(() =>
        InputIntentSchema.parse({
          direction: 5,
          boost: false,
          timestamp: Date.now(),
        })
      ).toThrow();
    });

    it('should reject negative timestamp', () => {
      expect(() =>
        InputIntentSchema.parse({
          direction: 1,
          boost: false,
          timestamp: -1,
        })
      ).toThrow();
    });
  });

  describe('JoinRoomSchema', () => {
    it('should validate correct join data', () => {
      const join = {
        nickname: 'Player123',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      expect(() => JoinRoomSchema.parse(join)).not.toThrow();
    });

    it('should reject empty nickname', () => {
      expect(() =>
        JoinRoomSchema.parse({
          nickname: '',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
        })
      ).toThrow();
    });

    it('should reject nickname with invalid characters', () => {
      expect(() =>
        JoinRoomSchema.parse({
          nickname: 'Player@#$',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
        })
      ).toThrow();
    });
  });

  describe('AdminLoginSchema', () => {
    it('should validate correct login', () => {
      const login = {
        email: 'admin@example.com',
        password: 'SecurePass123',
      };
      expect(() => AdminLoginSchema.parse(login)).not.toThrow();
    });

    it('should reject invalid email', () => {
      expect(() =>
        AdminLoginSchema.parse({
          email: 'not-an-email',
          password: 'SecurePass123',
        })
      ).toThrow();
    });

    it('should reject short password', () => {
      expect(() =>
        AdminLoginSchema.parse({
          email: 'admin@example.com',
          password: 'short',
        })
      ).toThrow();
    });
  });

  describe('AdminConfigSchema', () => {
    it('should validate partial config update', () => {
      const config = {
        tickHz: 15,
        roomCapacity: 12,
      };
      expect(() => AdminConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject invalid tick rate', () => {
      expect(() =>
        AdminConfigSchema.parse({
          tickHz: 100, // Too high
        })
      ).toThrow();
    });

    it('should accept empty config (all optional)', () => {
      expect(() => AdminConfigSchema.parse({})).not.toThrow();
    });
  });
});
