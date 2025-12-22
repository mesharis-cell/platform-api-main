// ----------------- Message generator for enum -----------------------------
export const enumMessageGenerator = (field: string, values: string[]): string => {
  return `${field} must be ${values.slice(0, -1).join(", ") + " or " + values[values.length - 1]}`;
}