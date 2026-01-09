// ---------------------------- Message generator for enum -----------------------------
export const enumMessageGenerator = (field: string, values: string[]): string => {
  return `${field} must be ${values.slice(0, -1).join(", ") + " or " + values[values.length - 1]}`;
}

// ---------------------------- Validate URL format ------------------------------------
export function isValidUrl(url: string): boolean {
  if (!url || url.length > 500) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

// ---------------------------- OTP Generator ------------------------------------------
export const OTPGenerator = () => {
  return Math.floor(100000 + Math.random() * 900000);
};