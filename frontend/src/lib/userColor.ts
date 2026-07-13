const PALETTE: readonly string[] = [
  '#F97316',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#22C55E',
  '#EAB308',
  '#EF4444',
  '#3B82F6',
];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
