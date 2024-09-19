function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export { clamp as default, clamp };
