import type { ErrorCode, Locale } from './types';

export const ERROR_MESSAGES: Record<ErrorCode, Record<Locale, string>> = {
  NICKNAME_INVALID: {
    en: 'Invalid nickname. Use 1-16 characters (letters, numbers, spaces, _, -).',
    es: 'Nombre inválido. Usa 1-16 caracteres (letras, números, espacios, _, -).',
  },
  NICKNAME_TAKEN: {
    en: 'Nickname already taken.',
    es: 'El nombre ya está en uso.',
  },
  ROOM_FULL: {
    en: 'Room is full. Try again later.',
    es: 'La sala está llena. Intenta más tarde.',
  },
  SESSION_EXPIRED: {
    en: 'Your session expired. Please start a new game.',
    es: 'Tu sesión expiró. Por favor comienza una nueva partida.',
  },
  INVALID_INPUT: {
    en: 'Invalid input. Please try again.',
    es: 'Entrada inválida. Por favor intenta de nuevo.',
  },
  REVIVE_UNAVAILABLE: {
    en: 'Rewarded revival is not available on standard websites. Support coming soon.',
    es: 'El revive recompensado no está disponible en sitios web estándar. Pronto habrá soporte.',
  },
  REVIVE_ALREADY_USED: {
    en: 'You already used your revival for this run.',
    es: 'Ya usaste tu revive para esta partida.',
  },
  REVIVE_CLAIM_EXPIRED: {
    en: 'Your revival claim expired. Start a new run.',
    es: 'Tu reclamación de revive expiró. Comienza una nueva partida.',
  },
  AD_NOT_CONFIGURED: {
    en: 'Ads are not configured.',
    es: 'Los anuncios no están configurados.',
  },
  AD_BLOCKED: {
    en: 'Ad blocked or not loaded. Try again.',
    es: 'El anuncio fue bloqueado o no se cargó. Intenta de nuevo.',
  },
  AUTH_FAILED: {
    en: 'Authentication failed. Check your credentials.',
    es: 'La autenticación falló. Verifica tus credenciales.',
  },
  PERMISSION_DENIED: {
    en: 'You do not have permission to do this.',
    es: 'No tienes permiso para hacer esto.',
  },
  INVALID_CONFIG: {
    en: 'Invalid configuration.',
    es: 'Configuración inválida.',
  },
  INTERNAL_ERROR: {
    en: 'An internal error occurred. Please try again.',
    es: 'Ocurrió un error interno. Por favor intenta de nuevo.',
  },
};

export function getErrorMessage(code: ErrorCode, locale: Locale): string {
  return ERROR_MESSAGES[code]?.[locale] || ERROR_MESSAGES[code]?.['en'] || 'Unknown error';
}
