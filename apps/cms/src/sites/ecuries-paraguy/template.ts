import { template as poignyTemplate } from '../ecuries-poigny/template'
import { seedLogo } from './seedImages'

/**
 * Maquette « Les Écuries de Paraguy » : celle des Écuries de Poigny, avec le nom et les
 * coordonnées fictifs à la place des vrais (le reste vient du CMS, comme pour Poigny).
 */
const PAIRS: [string, string][] = [
  ["24 route de la Ferme d'Hennepont", '12 chemin des Prés'],
  ["route de la Ferme d'Hennepont", 'chemin des Prés'],
  ['curies de Poigny', 'curies de Paraguy'],
  ['>POIGNY</text>', '>PARAGUY</text>'],
]
export const template: string = PAIRS.reduce((t, [a, b]) => t.split(a).join(b), poignyTemplate)
export const fallbackLogo = `data:image/png;base64,${seedLogo.b64}`
