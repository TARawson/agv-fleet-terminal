import type { TFunction } from 'i18next';

const KNOWN_CODES = ['LOW_BATTERY', 'OPTICAL_OBSTRUCTION'] as const;

type KnownAlarmCode = (typeof KNOWN_CODES)[number];

function isKnownCode(code: string): code is KnownAlarmCode {
  return (KNOWN_CODES as readonly string[]).includes(code);
}

/** Known alarm codes use the catalog. Anything else stays as the source sent it. */
export function alarmText(t: TFunction, code: string, fallback: string): string {
  if (!isKnownCode(code)) {
    return fallback;
  }
  return t(`alarms.${code}`);
}
