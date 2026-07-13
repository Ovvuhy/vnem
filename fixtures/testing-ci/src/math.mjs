export function double(value) {
  if (!Number.isFinite(value)) throw new TypeError("value must be finite");
  return value * 2;
}
