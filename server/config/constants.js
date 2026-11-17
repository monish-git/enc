export const THEMES = ['win95', 'win98', 'desert', 'hacker', 'amber', 'contrast'];

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
// X25519 raw public key: 32 bytes -> 44 chars standard base64 (one '=' pad)
export const PUBKEY_RE = /^[A-Za-z0-9+/]{43}=$/;

export const ALG = 'ECN1-X25519-HKDF256-AES256GCM';

// Limits (bytes of decoded data)
export const MAX_CIPHERTEXT_BYTES = 1_500_000;
export const IV_BYTES = 12;
export const SALT_BYTES = 16;
export const GCM_TAG_BYTES = 16;

export const COOKIE_NAME_PROD = '__Host-ecn_sid';
export const COOKIE_NAME_DEV = 'ecn_sid';
