import { describe, it, expect } from 'vitest';
import {
  InputMessageSchema,
  JoinMessageSchema,
  AdminLoginSchema,
  AdminConfigSchema,
} from './schemas.js';

describe('Schemas', () => {
  describe('InputMessageSchema', () => {
    it('accepts a steering angle and boost flag', () => {
      expect(() => InputMessageSchema.parse({ type: 'input', a: 1.2, b: false })).not.toThrow();
    });

    it('rejects non-numeric or out-of-range angles', () => {
      expect(() => InputMessageSchema.parse({ type: 'input', a: 'x', b: false })).toThrow();
      expect(() => InputMessageSchema.parse({ type: 'input', a: 1e9, b: false })).toThrow();
      expect(() => InputMessageSchema.parse({ type: 'input', a: Infinity, b: false })).toThrow();
    });
  });

  describe('JoinMessageSchema', () => {
    it('accepts a join with any safe session id (not only UUIDs)', () => {
      expect(() =>
        JoinMessageSchema.parse({ type: 'join', nickname: 'Player123', sessionId: 'a1b2c3d4e5f6a7b8' })
      ).not.toThrow();
    });

    it('rejects empty nickname and unsafe session ids', () => {
      expect(() => JoinMessageSchema.parse({ type: 'join', nickname: '', sessionId: 'a1b2c3d4e5f6' })).toThrow();
      expect(() => JoinMessageSchema.parse({ type: 'join', nickname: 'ok', sessionId: '<script>' })).toThrow();
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
