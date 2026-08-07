const ABBY_BASE_URL = 'https://api.app-abby.com';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (status, message) => json({ error: message }, status);

class AbbyError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const abbyRequest = async (env, path, { method = 'GET', body } = {}) => {
  const response = await fetch(`${ABBY_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.ABBY_API_KEY}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const details = (data.errors ?? [])
      .flatMap((entry) => Object.values(entry.constraints ?? {}))
      .join(' ; ');
    const message = details || data.message || `réponse ${response.status}`;
    throw new AbbyError(message, response.status);
  }
  return data;
};

const toCents = (amount) => Math.round(Number(amount) * 100);

const findOrCreateOrganization = async (env, buyer) => {
  const name = String(buyer.name ?? '').trim();
  const search = await abbyRequest(
    env,
    `/organizations?page=1&limit=20&search=${encodeURIComponent(name)}`,
  );
  const existing = (search.docs ?? []).find(
    (organization) => organization.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing;

  const payload = { name, emails: buyer.email ? [buyer.email] : [] };
  if (buyer.addressLine && buyer.postalCode && buyer.city) {
    payload.billingAddress = {
      address: buyer.addressLine,
      city: buyer.city,
      zipCode: buyer.postalCode,
      country: buyer.countryCode || 'FR',
    };
  }
  if (String(buyer.siren ?? '').replace(/\D/g, '').length === 14) {
    payload.siret = String(buyer.siren).replace(/\D/g, '');
  }
  return abbyRequest(env, '/organization', { method: 'POST', body: payload });
};

const toAbbyLines = (invoice) =>
  invoice.lines.map((line) => ({
    unitPrice: toCents(line.unitPrice),
    quantity: Number(line.quantity) || 1,
    quantityUnit: 'unit',
    designation: String(line.description ?? '').slice(0, 500),
    type: 'commercial_or_craft_services',
    vatCode: 'FR_00HT',
  }));

export const transmitInvoiceToAbby = async (request, env) => {
  if (!env.ABBY_API_KEY) return fail(503, 'La liaison Abby n’est pas configurée sur le serveur.');

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Contenu illisible.');
  }

  const invoice = body?.invoice;
  if (!invoice?.buyer?.name || !Array.isArray(invoice.lines) || invoice.lines.length === 0) {
    return fail(422, 'Facture incomplète : client ou lignes manquants.');
  }

  try {
    const organization = await findOrCreateOrganization(env, invoice.buyer);
    const draft = await abbyRequest(env, `/v2/billing/invoice/${organization.id}`, {
      method: 'POST',
      body: {},
    });

    const allowanceTotal = (invoice.allowances ?? []).reduce(
      (sum, allowance) => sum + Number(allowance.amount ?? 0),
      0,
    );
    const linesPayload = { lines: toAbbyLines(invoice) };
    if (allowanceTotal > 0) {
      linesPayload.discount = { amount: toCents(allowanceTotal), mode: 'AMOUNT' };
    }
    const updated = await abbyRequest(env, `/v2/billing/${draft.id}/lines`, {
      method: 'PATCH',
      body: linesPayload,
    });

    if (!updated.finalizable) {
      return json(
        {
          abbyBillingId: draft.id,
          state: updated.state,
          finalized: false,
          finalizeRequirements: (updated.finalizeRequirements ?? []).map((item) => item.message),
        },
        409,
      );
    }

    // La finalisation chez Abby attribue la numérotation officielle :
    // c'est elle que porte la facture remise au client.
    const finalized = await abbyRequest(env, `/v2/billing/${draft.id}/finalize`, {
      method: 'PATCH',
      body: {},
    });

    return json({
      abbyBillingId: draft.id,
      organizationId: organization.id,
      state: finalized.state,
      finalized: true,
      number: finalized.number ?? null,
      isTestInvoice: Boolean(finalized.test),
      totalExcludingVatCents: finalized.total?.amountWithoutTaxAfterDiscount ?? null,
    });
  } catch (cause) {
    if (cause instanceof AbbyError) return fail(502, `Abby a refusé la demande : ${cause.message}`);
    throw cause;
  }
};
