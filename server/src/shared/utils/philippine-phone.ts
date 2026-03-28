const PHILIPPINE_MOBILE_MESSAGE =
  'Please enter a valid Philippine mobile number, like 09171234567 or +639171234567.';

function getPhoneDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidPhilippinePhone(value: string | null | undefined) {
  const digits = getPhoneDigits(value);

  if (digits.length === 11) {
    return /^09\d{9}$/.test(digits);
  }

  if (digits.length === 12) {
    return /^639\d{9}$/.test(digits);
  }

  return false;
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

export function toComparablePhilippinePhone(value: string | null | undefined) {
  const digits = getPhoneDigits(value);

  if (/^09\d{9}$/.test(digits)) {
    return `63${digits.slice(1)}`;
  }

  if (/^639\d{9}$/.test(digits)) {
    return digits;
  }

  return digits;
}

export function getPhilippinePhoneValidationMessage() {
  return PHILIPPINE_MOBILE_MESSAGE;
}
