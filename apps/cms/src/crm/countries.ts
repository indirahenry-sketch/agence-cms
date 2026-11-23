/**
 * Pays de prospection en plus de la France. Leurs zones (provinces, cantons, états…) sont créées
 * inactives au démarrage ; on les active depuis Prospection → Zones. La recherche y utilise
 * OpenStreetMap et le site des établissements (l'annuaire des entreprises de l'État ne couvre que la France).
 * Code = code ISO 3166-2 (ou ISO 3166-1 pour un pays entier), celui qu'utilise OpenStreetMap.
 */
export type CountryZone = { code: string; name: string; region: string }
export type Country = { name: string; flag: string; iso: string; unit: string; units: string; language: 'fr' | 'en' | 'multi'; zones: CountryZone[]; whole?: boolean }

const z = (region: string, list: [string, string][]): CountryZone[] => list.map(([code, name]) => ({ code, name, region }))

export const COUNTRIES: Country[] = [
  {
    name: 'Belgique',
    flag: '🇧🇪',
    iso: 'BE',
    unit: 'province',
    units: 'provinces',
    language: 'multi',
    zones: [
      ...z('Wallonie', [['BE-WBR', 'Brabant wallon'], ['BE-WHT', 'Hainaut'], ['BE-WLG', 'Liège'], ['BE-WLX', 'Luxembourg (province)'], ['BE-WNA', 'Namur']]),
      ...z('Bruxelles', [['BE-BRU', 'Bruxelles-Capitale']]),
      ...z('Flandre', [['BE-VAN', 'Anvers'], ['BE-VBR', 'Brabant flamand'], ['BE-VLI', 'Limbourg'], ['BE-VOV', 'Flandre-Orientale'], ['BE-VWV', 'Flandre-Occidentale']]),
    ],
  },
  {
    name: 'Suisse',
    flag: '🇨🇭',
    iso: 'CH',
    unit: 'canton',
    units: 'cantons',
    language: 'multi',
    zones: [
      ...z('Romandie', [['CH-GE', 'Genève'], ['CH-VD', 'Vaud'], ['CH-NE', 'Neuchâtel'], ['CH-JU', 'Jura'], ['CH-FR', 'Fribourg'], ['CH-VS', 'Valais'], ['CH-BE', 'Berne']]),
      ...z('Suisse alémanique', [
        ['CH-ZH', 'Zurich'], ['CH-LU', 'Lucerne'], ['CH-UR', 'Uri'], ['CH-SZ', 'Schwytz'], ['CH-OW', 'Obwald'], ['CH-NW', 'Nidwald'], ['CH-GL', 'Glaris'], ['CH-ZG', 'Zoug'],
        ['CH-SO', 'Soleure'], ['CH-BS', 'Bâle-Ville'], ['CH-BL', 'Bâle-Campagne'], ['CH-SH', 'Schaffhouse'], ['CH-AR', 'Appenzell Rhodes-Extérieures'], ['CH-AI', 'Appenzell Rhodes-Intérieures'],
        ['CH-SG', 'Saint-Gall'], ['CH-GR', 'Grisons'], ['CH-AG', 'Argovie'], ['CH-TG', 'Thurgovie'],
      ]),
      ...z('Suisse italienne', [['CH-TI', 'Tessin']]),
    ],
  },
  { name: 'Luxembourg', flag: '🇱🇺', iso: 'LU', unit: 'pays', units: 'pays', language: 'multi', whole: true, zones: [{ code: 'LU', name: 'Luxembourg', region: 'Luxembourg' }] },
  { name: 'Monaco', flag: '🇲🇨', iso: 'MC', unit: 'pays', units: 'pays', language: 'fr', whole: true, zones: [{ code: 'MC', name: 'Monaco', region: 'Monaco' }] },
  {
    name: 'Canada',
    flag: '🇨🇦',
    iso: 'CA',
    unit: 'province',
    units: 'provinces',
    language: 'multi',
    zones: [
      ...z('Francophone', [['CA-QC', 'Québec']]),
      ...z('Bilingue', [['CA-NB', 'Nouveau-Brunswick']]),
      ...z('Anglophone', [
        ['CA-ON', 'Ontario'], ['CA-MB', 'Manitoba'], ['CA-NS', 'Nouvelle-Écosse'], ['CA-PE', 'Île-du-Prince-Édouard'], ['CA-NL', 'Terre-Neuve-et-Labrador'], ['CA-SK', 'Saskatchewan'],
        ['CA-AB', 'Alberta'], ['CA-BC', 'Colombie-Britannique'], ['CA-YT', 'Yukon'], ['CA-NT', 'Territoires du Nord-Ouest'], ['CA-NU', 'Nunavut'],
      ]),
    ],
  },
  { name: 'Maroc', flag: '🇲🇦', iso: 'MA', unit: 'pays', units: 'pays', language: 'fr', whole: true, zones: [{ code: 'MA', name: 'Maroc', region: 'Maroc' }] },
  { name: 'Tunisie', flag: '🇹🇳', iso: 'TN', unit: 'pays', units: 'pays', language: 'fr', whole: true, zones: [{ code: 'TN', name: 'Tunisie', region: 'Tunisie' }] },
  {
    name: 'États-Unis',
    flag: '🇺🇸',
    iso: 'US',
    unit: 'état',
    units: 'états',
    language: 'en',
    zones: [
      ...z('Nord-Est', [['US-CT', 'Connecticut'], ['US-ME', 'Maine'], ['US-MA', 'Massachusetts'], ['US-NH', 'New Hampshire'], ['US-RI', 'Rhode Island'], ['US-VT', 'Vermont'], ['US-NJ', 'New Jersey'], ['US-NY', 'New York'], ['US-PA', 'Pennsylvania']]),
      ...z('Midwest', [['US-IL', 'Illinois'], ['US-IN', 'Indiana'], ['US-MI', 'Michigan'], ['US-OH', 'Ohio'], ['US-WI', 'Wisconsin'], ['US-IA', 'Iowa'], ['US-KS', 'Kansas'], ['US-MN', 'Minnesota'], ['US-MO', 'Missouri'], ['US-NE', 'Nebraska'], ['US-ND', 'North Dakota'], ['US-SD', 'South Dakota']]),
      ...z('Sud', [
        ['US-DE', 'Delaware'], ['US-DC', 'District of Columbia'], ['US-FL', 'Florida'], ['US-GA', 'Georgia'], ['US-MD', 'Maryland'], ['US-NC', 'North Carolina'], ['US-SC', 'South Carolina'], ['US-VA', 'Virginia'],
        ['US-WV', 'West Virginia'], ['US-AL', 'Alabama'], ['US-KY', 'Kentucky'], ['US-MS', 'Mississippi'], ['US-TN', 'Tennessee'], ['US-AR', 'Arkansas'], ['US-LA', 'Louisiana'], ['US-OK', 'Oklahoma'], ['US-TX', 'Texas'],
      ]),
      ...z('Ouest', [['US-AZ', 'Arizona'], ['US-CO', 'Colorado'], ['US-ID', 'Idaho'], ['US-MT', 'Montana'], ['US-NV', 'Nevada'], ['US-NM', 'New Mexico'], ['US-UT', 'Utah'], ['US-WY', 'Wyoming'], ['US-AK', 'Alaska'], ['US-CA', 'California'], ['US-HI', 'Hawaii'], ['US-OR', 'Oregon'], ['US-WA', 'Washington']]),
    ],
  },
]

export const FRANCE = { name: 'France', flag: '🇫🇷', iso: 'FR', unit: 'département', units: 'départements' } as const

export const countryByName = (name?: string | null) => COUNTRIES.find((c) => c.name === name)

/** Sélecteur de zone OpenStreetMap (Overpass) pour une zone hors de France. */
export const osmArea = (code: string) => (/^[A-Z]{2}$/.test(code) ? `area["ISO3166-1"="${code}"]["admin_level"="2"]` : `area["ISO3166-2"="${code}"]`)
