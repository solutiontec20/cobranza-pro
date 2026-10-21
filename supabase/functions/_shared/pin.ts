const COMMON_PINS = new Set([
  '000000',
  '111111',
  '123123',
  '123456',
  '654321',
]);

export function isSixDigitPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

export function isWeakPin(pin: string, dni: string): boolean {
  if (COMMON_PINS.has(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return true;
  return dni.startsWith(pin) || dni.endsWith(pin);
}

export function generateTemporaryPin(dni: string): string {
  const range = 1_000_000;
  const unbiasedLimit = 2 ** 32 - ((2 ** 32) % range);

  for (;;) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    if (random >= unbiasedLimit) continue;

    const pin = String(random % range).padStart(6, '0');
    if (!isWeakPin(pin, dni)) return pin;
  }
}

