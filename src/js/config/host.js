// L'application sert deux publics selon le domaine :
// - convoyeur.chanfiou-convoyage.fr : espace convoyeur (ouvre sur les missions)
// - chanfiou-convoyage.fr : parcours client, sans l'onglet Espace
export const IS_OPERATOR_HOST = window.location.hostname.startsWith('convoyeur.');
