/**
 * Espace Prospection (CRM) : listes de référence.
 *
 * Tout ce qui est « métier » (statuts, types de structures…) est réuni ici pour rester
 * lisible et modifiable en un seul endroit. Les ZONES (départements, pays) ne sont pas ici :
 * elles vivent dans la base (collection crm-zones) et se modifient depuis le CMS.
 */

type Option = { label: string; value: string }

/** Statut commercial d'un prospect (de la découverte au client ou au refus). */
export const CRM_STATUSES = [
  { label: 'Nouveau prospect', value: 'nouveau' },
  { label: 'À vérifier', value: 'a-verifier' },
  { label: 'Qualifié', value: 'qualifie' },
  { label: 'E-mail à préparer', value: 'email-a-preparer' },
  { label: 'Brouillon créé', value: 'brouillon-cree' },
  { label: 'E-mail envoyé', value: 'email-envoye' },
  { label: 'En attente de réponse', value: 'en-attente' },
  { label: 'Relance à effectuer', value: 'relance' },
  { label: 'Client', value: 'client' },
  { label: 'Non intéressé', value: 'non-interesse' },
  { label: 'Ne plus contacter', value: 'ne-plus-contacter' },
] as const satisfies readonly Option[]

export type CrmStatus = (typeof CRM_STATUSES)[number]['value']

/** Statuts après lesquels on ne sollicite plus jamais le prospect. */
export const CRM_STOP_STATUSES: CrmStatus[] = ['non-interesse', 'ne-plus-contacter']

/** Types de structures équestres recherchées. */
export const CRM_TYPES = [
  { label: 'Écurie', value: 'ecurie' },
  { label: 'Écurie de propriétaires', value: 'ecurie-proprietaires' },
  { label: 'Élevage de chevaux', value: 'elevage' },
  { label: 'Haras', value: 'haras' },
  { label: 'Centre équestre', value: 'centre-equestre' },
  { label: 'Poney-club', value: 'poney-club' },
  { label: 'Domaine équestre', value: 'domaine-equestre' },
  { label: 'Structure équestre indépendante', value: 'structure-independante' },
  { label: 'Autre', value: 'autre' },
] as const satisfies readonly Option[]

/** Présence d'un site Internet : détermine l'offre (création ou refonte). */
export const CRM_WEBSITE_STATUSES = [
  { label: 'Sans site officiel trouvé', value: 'sans-site' },
  { label: 'Site existant', value: 'site-existant' },
  { label: 'À vérifier', value: 'a-verifier' },
] as const satisfies readonly Option[]

/** Niveau de fiabilité d'UNE information (téléphone, e-mail…). */
export const CRM_INFO_LEVELS = [
  { label: 'Vérifié', value: 'verifie' },
  { label: 'À vérifier', value: 'a-verifier' },
  { label: 'Non trouvé', value: 'non-trouve' },
] as const satisfies readonly Option[]

/** Niveau de vérification global de la fiche. */
export const CRM_VERIFICATION_LEVELS = [
  { label: 'Vérifiée', value: 'verifie' },
  { label: 'Partiellement vérifiée', value: 'partiel' },
  { label: 'À vérifier', value: 'a-verifier' },
] as const satisfies readonly Option[]

export const CRM_PRIORITIES = [
  { label: 'Haute', value: 'haute' },
  { label: 'Moyenne', value: 'moyenne' },
  { label: 'Basse', value: 'basse' },
] as const satisfies readonly Option[]

/** Besoin commercial, déduit du site Internet si on ne le choisit pas. */
export const CRM_NEEDS = [
  { label: 'Création de site', value: 'creation' },
  { label: 'Refonte / amélioration', value: 'refonte' },
  { label: 'À déterminer', value: 'a-determiner' },
] as const satisfies readonly Option[]

/** Types d'échanges dans le suivi d'un prospect. */
export const CRM_ACTIVITY_KINDS = [
  { label: 'Note', value: 'note' },
  { label: 'Appel', value: 'appel' },
  { label: 'E-mail envoyé', value: 'email-envoye' },
  { label: 'Réponse reçue', value: 'reponse' },
  { label: 'Relance', value: 'relance' },
  { label: 'Rendez-vous', value: 'rdv' },
  { label: 'Autre', value: 'autre' },
] as const satisfies readonly Option[]

/** Types de modèles d'e-mails (le type « Refonte » ou « Création » est proposé selon le besoin du prospect). */
export const CRM_TEMPLATE_KINDS = [
  { label: 'Refonte de site', value: 'refonte' },
  { label: 'Création de site', value: 'creation' },
  { label: 'Relance', value: 'relance' },
  { label: 'Autre', value: 'autre' },
] as const satisfies readonly Option[]

export const CRM_GROUP = 'Prospection (CRM)'

/** Départements de la première phase : activés automatiquement à la création des zones. */
export const CRM_LAUNCH_DEPARTMENTS = ['11', '34', '66', '30', '31', '13', '83', '84']

/** Les 101 départements français (métropole + outre-mer), avec leur région. */
export const FRENCH_DEPARTMENTS: { code: string; name: string; region: string }[] = [
  ...[
    ['01', 'Ain'], ['03', 'Allier'], ['07', 'Ardèche'], ['15', 'Cantal'], ['26', 'Drôme'], ['38', 'Isère'],
    ['42', 'Loire'], ['43', 'Haute-Loire'], ['63', 'Puy-de-Dôme'], ['69', 'Rhône'], ['73', 'Savoie'], ['74', 'Haute-Savoie'],
  ].map(([code, name]) => ({ code, name, region: 'Auvergne-Rhône-Alpes' })),
  ...[
    ['21', "Côte-d'Or"], ['25', 'Doubs'], ['39', 'Jura'], ['58', 'Nièvre'], ['70', 'Haute-Saône'],
    ['71', 'Saône-et-Loire'], ['89', 'Yonne'], ['90', 'Territoire de Belfort'],
  ].map(([code, name]) => ({ code, name, region: 'Bourgogne-Franche-Comté' })),
  ...[['22', "Côtes-d'Armor"], ['29', 'Finistère'], ['35', 'Ille-et-Vilaine'], ['56', 'Morbihan']].map(([code, name]) => ({ code, name, region: 'Bretagne' })),
  ...[
    ['18', 'Cher'], ['28', 'Eure-et-Loir'], ['36', 'Indre'], ['37', 'Indre-et-Loire'], ['41', 'Loir-et-Cher'], ['45', 'Loiret'],
  ].map(([code, name]) => ({ code, name, region: 'Centre-Val de Loire' })),
  ...[['2A', 'Corse-du-Sud'], ['2B', 'Haute-Corse']].map(([code, name]) => ({ code, name, region: 'Corse' })),
  ...[
    ['08', 'Ardennes'], ['10', 'Aube'], ['51', 'Marne'], ['52', 'Haute-Marne'], ['54', 'Meurthe-et-Moselle'],
    ['55', 'Meuse'], ['57', 'Moselle'], ['67', 'Bas-Rhin'], ['68', 'Haut-Rhin'], ['88', 'Vosges'],
  ].map(([code, name]) => ({ code, name, region: 'Grand Est' })),
  ...[['02', 'Aisne'], ['59', 'Nord'], ['60', 'Oise'], ['62', 'Pas-de-Calais'], ['80', 'Somme']].map(([code, name]) => ({ code, name, region: 'Hauts-de-France' })),
  ...[
    ['75', 'Paris'], ['77', 'Seine-et-Marne'], ['78', 'Yvelines'], ['91', 'Essonne'], ['92', 'Hauts-de-Seine'],
    ['93', 'Seine-Saint-Denis'], ['94', 'Val-de-Marne'], ['95', "Val-d'Oise"],
  ].map(([code, name]) => ({ code, name, region: 'Île-de-France' })),
  ...[['14', 'Calvados'], ['27', 'Eure'], ['50', 'Manche'], ['61', 'Orne'], ['76', 'Seine-Maritime']].map(([code, name]) => ({ code, name, region: 'Normandie' })),
  ...[
    ['16', 'Charente'], ['17', 'Charente-Maritime'], ['19', 'Corrèze'], ['23', 'Creuse'], ['24', 'Dordogne'], ['33', 'Gironde'],
    ['40', 'Landes'], ['47', 'Lot-et-Garonne'], ['64', 'Pyrénées-Atlantiques'], ['79', 'Deux-Sèvres'], ['86', 'Vienne'], ['87', 'Haute-Vienne'],
  ].map(([code, name]) => ({ code, name, region: 'Nouvelle-Aquitaine' })),
  ...[
    ['09', 'Ariège'], ['11', 'Aude'], ['12', 'Aveyron'], ['30', 'Gard'], ['31', 'Haute-Garonne'], ['32', 'Gers'], ['34', 'Hérault'],
    ['46', 'Lot'], ['48', 'Lozère'], ['65', 'Hautes-Pyrénées'], ['66', 'Pyrénées-Orientales'], ['81', 'Tarn'], ['82', 'Tarn-et-Garonne'],
  ].map(([code, name]) => ({ code, name, region: 'Occitanie' })),
  ...[
    ['44', 'Loire-Atlantique'], ['49', 'Maine-et-Loire'], ['53', 'Mayenne'], ['72', 'Sarthe'], ['85', 'Vendée'],
  ].map(([code, name]) => ({ code, name, region: 'Pays de la Loire' })),
  ...[
    ['04', 'Alpes-de-Haute-Provence'], ['05', 'Hautes-Alpes'], ['06', 'Alpes-Maritimes'], ['13', 'Bouches-du-Rhône'], ['83', 'Var'], ['84', 'Vaucluse'],
  ].map(([code, name]) => ({ code, name, region: "Provence-Alpes-Côte d'Azur" })),
  { code: '971', name: 'Guadeloupe', region: 'Guadeloupe' },
  { code: '972', name: 'Martinique', region: 'Martinique' },
  { code: '973', name: 'Guyane', region: 'Guyane' },
  { code: '974', name: 'La Réunion', region: 'La Réunion' },
  { code: '976', name: 'Mayotte', region: 'Mayotte' },
]

/**
 * Statut commercial SIMPLIFIÉ (Base de prospection) : 4 couleurs qui regroupent les 11 statuts
 * détaillés. Changer le statut simplifié depuis le tableau garde le statut détaillé s'il est déjà
 * dans le bon groupe, sinon il prend le statut « par défaut » du groupe.
 */
export const CRM_COMMERCIAL = [
  { value: 'a-contacter', label: 'À contacter', tone: 'peach', set: 'nouveau', statuses: ['nouveau', 'a-verifier', 'qualifie', 'email-a-preparer', 'brouillon-cree'] },
  { value: 'contacte', label: 'Contacté', tone: 'sky', set: 'en-attente', statuses: ['email-envoye', 'en-attente', 'relance'] },
  { value: 'accepte', label: 'Accepté', tone: 'mint', set: 'client', statuses: ['client'] },
  { value: 'refuse', label: 'Refusé', tone: 'rose', set: 'non-interesse', statuses: ['non-interesse', 'ne-plus-contacter'] },
] as const

export type CrmCommercial = (typeof CRM_COMMERCIAL)[number]['value']

export const commercialOf = (status?: string | null): CrmCommercial =>
  (CRM_COMMERCIAL.find((c) => (c.statuses as readonly string[]).includes(status ?? ''))?.value ?? 'a-contacter') as CrmCommercial

/** Statut détaillé à enregistrer quand on choisit un statut simplifié. */
export const statusForCommercial = (target: CrmCommercial, current?: string | null): CrmStatus => {
  const group = CRM_COMMERCIAL.find((c) => c.value === target)!
  return ((group.statuses as readonly string[]).includes(current ?? '') ? current : group.set) as CrmStatus
}

/** Avancement du site / projet. */
export const CRM_PROJECT_STATUSES = [
  { label: 'À faire', value: 'a-faire' },
  { label: 'En cours', value: 'en-cours' },
  { label: 'En livraison', value: 'en-livraison' },
  { label: 'Livré', value: 'livre' },
] as const satisfies readonly Option[]
