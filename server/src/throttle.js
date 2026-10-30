// Limitation de débit adossée à D1 : un compteur par (portée, adresse IP)
// sur une fenêtre glissante. De quoi freiner la force brute sur la connexion
// et le spam de demandes, sans dépendance externe.

const bucketOf = (scope, request) =>
  `${scope}:${request.headers.get('cf-connecting-ip') ?? 'ip-inconnue'}`;

// Retourne true quand la limite est atteinte. En cas d'erreur (table absente,
// indisponibilité D1), on laisse passer : la limitation est une protection,
// elle ne doit jamais rendre le service inutilisable.
export const isRateLimited = async (env, scope, request, maxAttempts, windowSeconds) => {
  const bucket = bucketOf(scope, request);
  try {
    const now = Date.now();
    const row = await env.DB.prepare('SELECT count, window_start FROM throttle WHERE bucket = ?1')
      .bind(bucket)
      .first();

    if (row && now - Date.parse(row.window_start) < windowSeconds * 1000) {
      if (row.count >= maxAttempts) return true;
      await env.DB.prepare('UPDATE throttle SET count = count + 1 WHERE bucket = ?1').bind(bucket).run();
      return false;
    }

    await env.DB.prepare(
      'INSERT INTO throttle (bucket, count, window_start) VALUES (?1, 1, ?2) ' +
        'ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = ?2',
    )
      .bind(bucket, new Date(now).toISOString())
      .run();
    return false;
  } catch (cause) {
    console.error('limitation de débit indisponible', cause);
    return false;
  }
};

const STALE_AFTER_SECONDS = 24 * 3600
export const purgeExpiredThrottle = async (env, now = new Date()) => {
    const cutoff = new Date(now.getTime() - STALE_AFTER_SECONDS * 1000).toISOString();
    const { meta } = await env.DB.prepare('DELETE FROM throttle WHERE windows_start < ?1').bind(cutoff).run();
    return { purged : meta?.changes ?? 0};
};
// Une connexion réussie remet le compteur à zéro : l'opérateur qui se trompe
// deux fois puis réussit ne reste pas pénalisé.
export const clearRateLimit = async (env, scope, request) => {
  try {
    await env.DB.prepare('DELETE FROM throttle WHERE bucket = ?1').bind(bucketOf(scope, request)).run();
  } catch {
    // Sans conséquence : la fenêtre expirera d'elle-même.
  }
};
