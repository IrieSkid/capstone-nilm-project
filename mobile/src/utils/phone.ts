const PHILIPPINE_PHONE_MESSAGE =
  'Enter a valid Philippine mobile number like 09171234567 or +639171234567.';

function getPhoneDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidPhilippinePhone(value: string | null | undefined) {
  const digits = getPhoneDigits(value);

  return /^09\d{9}$/.test(digits) || /^639\d{9}$/.test(digits);
}

export function normalizePhilippinePhone(value: string | null | undefined) {
  const digits = getPhoneDigits(value);

  if (/^639\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }

  if (/^09\d{9}$/.test(digits)) {
    return digits;
  }

  return String(value ?? '').trim();
}

export function getPhilippinePhoneMessage() {
  return PHILIPPINE_PHONE_MESSAGE;
}
