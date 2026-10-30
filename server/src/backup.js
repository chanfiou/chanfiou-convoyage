const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (status, message) => json({ error: message }, status);

const LATEST_KEY = 'backup/dernier.json';
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

// Sauvegarde de l'espace convoyeur (factures, avoirs, réglages) sur le
// stockage objet : ce que la synchronisation des missions ne couvre pas.
export const writeBackup = async (request, env) => {
  if (!env.PHOTOS) return fail(503, 'Le stockage des sauvegardes n’est pas configuré.');

  const raw = await request.text();
  if (raw.length > MAX_BACKUP_BYTES) return fail(413, 'Sauvegarde trop volumineuse.');

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    return fail(400, 'Sauvegarde illisible.');
  }
  if (backup?.format !== 'chanfiou-convoyage' || !backup?.data) {
    return fail(422, 'Format de sauvegarde inattendu.');
  }

  const savedAt = new Date().toISOString();
  const body = JSON.stringify({ ...backup, savedAt });
  const metadata = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };
  await env.PHOTOS.put(LATEST_KEY, body, metadata);
  // Une copie datée par jour permet de remonter en arrière si besoin.
  await env.PHOTOS.put(`backup/${savedAt.slice(0, 10)}.json`, body, metadata);

  return json({ savedAt, counts: backup.counts ?? null });
};

const RETENTION_DAYS = 30;
export const purgeOldBackups = async (env, now = new Date()) => {
    if (!env.PHOTOS) return { purged: 0 };
    const cutoff = new Date(now.getTime() - RETENTION_DAYS*24*3600*1000).toISOString().slice(0,10);
    const {objects} = await env.PHOTOS.list({prefix: 'backup/'});
    const expired = (objects ?? []).map((object) => object.key).filter((key) => /^backup\/\d{4}-\d{2}-\d{2}\.json$/.test(key) && key.slice(7,17) < cutoff);
    await Promise.all(expired.map((key) => env.PHOTOS.delete(key)));
    return { purged : expired.length};
    
};

export const readBackup = async (env) => {
  if (!env.PHOTOS) return fail(503, 'Le stockage des sauvegardes n’est pas configuré.');
  const object = await env.PHOTOS.get(LATEST_KEY);
  if (!object) return json({ backup: null });
  return new Response(object.body, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
