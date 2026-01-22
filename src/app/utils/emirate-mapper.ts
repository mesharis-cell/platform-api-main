/**
 * Emirate Mapping Utility
 * Maps cities/areas to UAE emirates for transport rate lookup
 */

export const EMIRATE_CITIES: Record<string, string[]> = {
  Dubai: [
    'dubai',
    'dxb',
    'dubai marina',
    'downtown dubai',
    'jumeirah',
    'deira',
    'bur dubai',
    'business bay',
    'jbr',
    'jlt',
    'difc',
    'dubai mall',
  ],
  'Abu Dhabi': [
    'abu dhabi',
    'abudhabi',
    'adh',
    'mussafah',
    'khalifa city',
    'saadiyat',
    'yas island',
    'reem island',
    'corniche',
  ],
  'Al Ain': ['al ain', 'alain'],
  Sharjah: ['sharjah', 'shj'],
  Ajman: ['ajman', 'ajm'],
  'Ras Al Khaimah': ['ras al khaimah', 'ras al-khaimah', 'rak'],
  'Umm Al Quwain': ['umm al quwain', 'umm al-quwain', 'uaq', 'umm al quawain'],
  Fujairah: ['fujairah', 'fujaira', 'fuj'],
}

/**
 * Map city name to emirate
 */
export function deriveEmirateFromCity(city: string): string {
  const cityLower = city.toLowerCase().trim()

  for (const [emirate, keywords] of Object.entries(EMIRATE_CITIES)) {
    for (const keyword of keywords) {
      if (cityLower.includes(keyword)) {
        return emirate
      }
    }
  }

  // Default to Dubai if can't determine
  return 'Dubai'
}

/**
 * Get all emirates
 */
export function getAllEmirates(): string[] {
  return Object.keys(EMIRATE_CITIES)
}

/**
 * Validate emirate name
 */
export function isValidEmirate(emirate: string): boolean {
  return Object.keys(EMIRATE_CITIES).includes(emirate)
}
