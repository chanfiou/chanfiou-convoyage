const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (status, message) => json({ error: message }, status);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (day, days) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const listAvailability = async (request, env, url, isOperator) => {
  const from = DAY_PATTERN.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from') : todayIso();
  const fallbackTo = addDaysIso(from, 180);
  const to = DAY_PATTERN.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to') : fallbackTo;

  const { results } = await env.DB.prepare(
    'SELECT day, reason, reference FROM availability WHERE day >= ?1 AND day <= ?2 ORDER BY day',
  )
    .bind(from, to)
    .all();

  if (isOperator) return json({ days: results ?? [] });
  return json({ days: [...new Set((results ?? []).map((row) => row.day))] });
};

export const setAvailability = async (request, env) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Contenu illisible.');
  }
  const day = String(body?.day ?? '');
  if (!DAY_PATTERN.test(day)) return fail(422, 'Jour invalide.');

  if (body?.blocked) {
    await env.DB.prepare(
      'INSERT INTO availability (day, reason, reference, created_at) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(day, reference) DO UPDATE SET reason = ?2',
    )
      .bind(day, 'manuel', '', new Date().toISOString())
      .run();
  } else {
    // Un déblocage manuel libère entièrement la journée, réservation comprise.
    await env.DB.prepare('DELETE FROM availability WHERE day = ?1').bind(day).run();
  }
  return json({ day, blocked: Boolean(body?.blocked) });
};

export const isDayBlocked = async (env, day) => {
  if (!DAY_PATTERN.test(day ?? '')) return false;
  const row = await env.DB.prepare('SELECT 1 AS present FROM availability WHERE day = ?1 LIMIT 1')
    .bind(day)
    .first();
  return Boolean(row);
};

export const blockDayForMission = async (env, day, reference) => {
  const normalized = String(day ?? '').slice(0, 10);
  if (!DAY_PATTERN.test(normalized)) return;
  await env.DB.prepare(
    'INSERT INTO availability (day, reason, reference, created_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(day, reference) DO UPDATE SET reason = ?2',
  )
    .bind(normalized, 'mission', reference, new Date().toISOString())
    .run();
};

export const unblockDayForMission = async (env, reference) => {
  await env.DB.prepare("DELETE FROM availability WHERE reference = ?1 AND reason = 'mission'")
    .bind(reference)
    .run();
};
