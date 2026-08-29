import type { CharacterStats } from '@shared/types'

export const STAT_LABELS: [keyof CharacterStats, string][] = [
  ['diplomacy', 'Diplomacy'],
  ['martial', 'Martial'],
  ['stewardship', 'Stewardship'],
  ['intrigue', 'Intrigue'],
  ['learning', 'Learning'],
  ['prowess', 'Prowess']
]
