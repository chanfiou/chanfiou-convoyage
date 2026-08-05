import { VAT_EXEMPTION_CODE } from '../config/pricing.js';
import { sirenFromSiret } from '../config/settings.js';
import { BUSINESS_TIME_ZONE } from '../core/format.js';

const GUIDELINE_ID = 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic';
const BUSINESS_PROCESS_ID = 'A1';
const INVOICE_TYPE_CODE = '380';
const CREDIT_NOTE_TYPE_CODE = '381';
const UNIT_CODE_PIECE = 'C62';
const PAYMENT_MEANS_TRANSFER = '30';
const CURRENCY = 'EUR';

const BASIC_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const amount = (value) => Number(value ?? 0).toFixed(2);

const price = (value) => Number(value ?? 0).toFixed(4);

export const toBasicDate = (isoDate) => {
  const parts = BASIC_DATE_FORMATTER.formatToParts(new Date(isoDate)).reduce(
    (accumulator, part) => ({ ...accumulator, [part.type]: part.value }),
    {},
  );
  return `${parts.year}${parts.month}${parts.day}`;
};

const noteElement = (content, subjectCode) => {
  if (!content) return '';
  return [
    '    <ram:IncludedNote>',
    `      <ram:Content>${escapeXml(content)}</ram:Content>`,
    `      <ram:SubjectCode>${subjectCode}</ram:SubjectCode>`,
    '    </ram:IncludedNote>',
  ].join('\n');
};

const postalAddress = (party, indent) => {
  const pad = ' '.repeat(indent);
  return [
    `${pad}<ram:PostalTradeAddress>`,
    party.postalCode ? `${pad}  <ram:PostcodeCode>${escapeXml(party.postalCode)}</ram:PostcodeCode>` : '',
    party.addressLine ? `${pad}  <ram:LineOne>${escapeXml(party.addressLine)}</ram:LineOne>` : '',
    party.city ? `${pad}  <ram:CityName>${escapeXml(party.city)}</ram:CityName>` : '',
    `${pad}  <ram:CountryID>${escapeXml(party.countryCode || 'FR')}</ram:CountryID>`,
    `${pad}</ram:PostalTradeAddress>`,
  ]
    .filter(Boolean)
    .join('\n');
};

const lineItem = (line, index) =>
  [
    '      <ram:IncludedSupplyChainTradeLineItem>',
    '        <ram:AssociatedDocumentLineDocument>',
    `          <ram:LineID>${index + 1}</ram:LineID>`,
    '        </ram:AssociatedDocumentLineDocument>',
    '        <ram:SpecifiedTradeProduct>',
    `          <ram:Name>${escapeXml(line.description)}</ram:Name>`,
    '        </ram:SpecifiedTradeProduct>',
    '        <ram:SpecifiedLineTradeAgreement>',
    '          <ram:NetPriceProductTradePrice>',
    `            <ram:ChargeAmount>${price(line.unitPrice)}</ram:ChargeAmount>`,
    `            <ram:BasisQuantity unitCode="${UNIT_CODE_PIECE}">${price(line.quantity)}</ram:BasisQuantity>`,
    '          </ram:NetPriceProductTradePrice>',
    '        </ram:SpecifiedLineTradeAgreement>',
    '        <ram:SpecifiedLineTradeDelivery>',
    `          <ram:BilledQuantity unitCode="${UNIT_CODE_PIECE}">${price(line.quantity)}</ram:BilledQuantity>`,
    '        </ram:SpecifiedLineTradeDelivery>',
    '        <ram:SpecifiedLineTradeSettlement>',
    '          <ram:ApplicableTradeTax>',
    '            <ram:TypeCode>VAT</ram:TypeCode>',
    '            <ram:CategoryCode>E</ram:CategoryCode>',
    '            <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
    '          </ram:ApplicableTradeTax>',
    '          <ram:SpecifiedTradeSettlementLineMonetarySummation>',
    `            <ram:LineTotalAmount>${amount(line.quantity * line.unitPrice)}</ram:LineTotalAmount>`,
    '          </ram:SpecifiedTradeSettlementLineMonetarySummation>',
    '        </ram:SpecifiedLineTradeSettlement>',
    '      </ram:IncludedSupplyChainTradeLineItem>',
  ].join('\n');

const sellerParty = (seller) =>
  [
    '        <ram:SellerTradeParty>',
    `          <ram:Name>${escapeXml(seller.name)}</ram:Name>`,
    '          <ram:SpecifiedLegalOrganization>',
    `            <ram:ID schemeID="0002">${escapeXml(sirenFromSiret(seller.siret))}</ram:ID>`,
    '          </ram:SpecifiedLegalOrganization>',
    postalAddress(seller, 10),
    seller.email
      ? [
          '          <ram:URIUniversalCommunication>',
          `            <ram:URIID schemeID="EM">${escapeXml(seller.email)}</ram:URIID>`,
          '          </ram:URIUniversalCommunication>',
        ].join('\n')
      : '',
    seller.vatNumber
      ? [
          '          <ram:SpecifiedTaxRegistration>',
          `            <ram:ID schemeID="VA">${escapeXml(seller.vatNumber)}</ram:ID>`,
          '          </ram:SpecifiedTaxRegistration>',
        ].join('\n')
      : '',
    '          <ram:SpecifiedTaxRegistration>',
    `            <ram:ID schemeID="FC">${escapeXml(seller.siret)}</ram:ID>`,
    '          </ram:SpecifiedTaxRegistration>',
    '        </ram:SellerTradeParty>',
  ]
    .filter(Boolean)
    .join('\n');

const buyerParty = (buyer) =>
  [
    '        <ram:BuyerTradeParty>',
    `          <ram:Name>${escapeXml(buyer.name)}</ram:Name>`,
    buyer.siren
      ? [
          '          <ram:SpecifiedLegalOrganization>',
          `            <ram:ID schemeID="0002">${escapeXml(buyer.siren)}</ram:ID>`,
          '          </ram:SpecifiedLegalOrganization>',
        ].join('\n')
      : '',
    postalAddress(buyer, 10),
    buyer.email
      ? [
          '          <ram:URIUniversalCommunication>',
          `            <ram:URIID schemeID="EM">${escapeXml(buyer.email)}</ram:URIID>`,
          '          </ram:URIUniversalCommunication>',
        ].join('\n')
      : '',
    '        </ram:BuyerTradeParty>',
  ]
    .filter(Boolean)
    .join('\n');

const allowanceCharge = (allowance) =>
  [
    '        <ram:SpecifiedTradeAllowanceCharge>',
    '          <ram:ChargeIndicator>',
    '            <udt:Indicator>false</udt:Indicator>',
    '          </ram:ChargeIndicator>',
    `          <ram:ActualAmount>${amount(allowance.amount)}</ram:ActualAmount>`,
    `          <ram:Reason>${escapeXml(allowance.reason)}</ram:Reason>`,
    '          <ram:CategoryTradeTax>',
    '            <ram:TypeCode>VAT</ram:TypeCode>',
    '            <ram:CategoryCode>E</ram:CategoryCode>',
    '            <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
    '          </ram:CategoryTradeTax>',
    '        </ram:SpecifiedTradeAllowanceCharge>',
  ].join('\n');

const isCreditNote = (document) => document.documentType === 'avoir';

const referencedInvoice = (document) => {
  if (!isCreditNote(document)) return '';
  return [
    '        <ram:InvoiceReferencedDocument>',
    `          <ram:IssuerAssignedID>${escapeXml(document.invoiceNumber)}</ram:IssuerAssignedID>`,
    '          <ram:FormattedIssueDateTime>',
    `            <qdt:DateTimeString format="102">${toBasicDate(document.invoiceIssuedAt)}</qdt:DateTimeString>`,
    '          </ram:FormattedIssueDateTime>',
    '        </ram:InvoiceReferencedDocument>',
  ].join('\n');
};

export const buildFacturXXml = (invoice) => {
  const { totals } = invoice;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsm:CrossIndustryInvoice',
    '  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
    '  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
    '  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
    '  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
    '  <rsm:ExchangedDocumentContext>',
    '    <ram:BusinessProcessSpecifiedDocumentContextParameter>',
    `      <ram:ID>${BUSINESS_PROCESS_ID}</ram:ID>`,
    '    </ram:BusinessProcessSpecifiedDocumentContextParameter>',
    '    <ram:GuidelineSpecifiedDocumentContextParameter>',
    `      <ram:ID>${GUIDELINE_ID}</ram:ID>`,
    '    </ram:GuidelineSpecifiedDocumentContextParameter>',
    '  </rsm:ExchangedDocumentContext>',
    '  <rsm:ExchangedDocument>',
    `    <ram:ID>${escapeXml(invoice.number)}</ram:ID>`,
    `    <ram:TypeCode>${isCreditNote(invoice) ? CREDIT_NOTE_TYPE_CODE : INVOICE_TYPE_CODE}</ram:TypeCode>`,
    '    <ram:IssueDateTime>',
    `      <udt:DateTimeString format="102">${toBasicDate(invoice.issuedAt)}</udt:DateTimeString>`,
    '    </ram:IssueDateTime>',
    noteElement(
      `${invoice.seller.name} — ${invoice.seller.legalForm} — SIRET ${invoice.seller.siret}`,
      'REG',
    ),
    noteElement(invoice.vatMention, 'AAI'),
    noteElement(`Nature de l’opération : ${invoice.operationNature}`, 'ABL'),
    isCreditNote(invoice)
      ? noteElement(`Avoir sur la facture ${invoice.invoiceNumber} — motif : ${invoice.reason}`, 'ADU')
      : '',
    noteElement(invoice.latePenaltyMention, 'PMD'),
    noteElement(invoice.recoveryIndemnityMention, 'PMT'),
    noteElement(invoice.noDiscountMention, 'AAB'),
    '  </rsm:ExchangedDocument>',
    '  <rsm:SupplyChainTradeTransaction>',
    invoice.lines.map(lineItem).join('\n'),
    '      <ram:ApplicableHeaderTradeAgreement>',
    `        <ram:BuyerReference>${escapeXml(invoice.missionReference)}</ram:BuyerReference>`,
    sellerParty(invoice.seller),
    buyerParty(invoice.buyer),
    '      </ram:ApplicableHeaderTradeAgreement>',
    '      <ram:ApplicableHeaderTradeDelivery>',
    '        <ram:ShipToTradeParty>',
    `          <ram:Name>${escapeXml(invoice.deliveryAddress)}</ram:Name>`,
    '        </ram:ShipToTradeParty>',
    '        <ram:ActualDeliverySupplyChainEvent>',
    '          <ram:OccurrenceDateTime>',
    `            <udt:DateTimeString format="102">${toBasicDate(invoice.deliveredAt)}</udt:DateTimeString>`,
    '          </ram:OccurrenceDateTime>',
    '        </ram:ActualDeliverySupplyChainEvent>',
    '      </ram:ApplicableHeaderTradeDelivery>',
    '      <ram:ApplicableHeaderTradeSettlement>',
    `        <ram:PaymentReference>${escapeXml(invoice.number)}</ram:PaymentReference>`,
    `        <ram:InvoiceCurrencyCode>${CURRENCY}</ram:InvoiceCurrencyCode>`,
    invoice.seller.iban
      ? [
          '        <ram:SpecifiedTradeSettlementPaymentMeans>',
          `          <ram:TypeCode>${PAYMENT_MEANS_TRANSFER}</ram:TypeCode>`,
          '          <ram:PayeePartyCreditorFinancialAccount>',
          `            <ram:IBANID>${escapeXml(invoice.seller.iban)}</ram:IBANID>`,
          '          </ram:PayeePartyCreditorFinancialAccount>',
          '        </ram:SpecifiedTradeSettlementPaymentMeans>',
        ].join('\n')
      : '',
    '        <ram:ApplicableTradeTax>',
    `          <ram:CalculatedAmount>${amount(totals.taxAmount)}</ram:CalculatedAmount>`,
    '          <ram:TypeCode>VAT</ram:TypeCode>',
    `          <ram:ExemptionReason>${escapeXml(invoice.vatMention)}</ram:ExemptionReason>`,
    `          <ram:BasisAmount>${amount(totals.taxBasis)}</ram:BasisAmount>`,
    '          <ram:CategoryCode>E</ram:CategoryCode>',
    `          <ram:ExemptionReasonCode>${VAT_EXEMPTION_CODE}</ram:ExemptionReasonCode>`,
    '          <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
    '        </ram:ApplicableTradeTax>',
    (invoice.allowances ?? []).map(allowanceCharge).join('\n'),
    '        <ram:SpecifiedTradePaymentTerms>',
    `          <ram:Description>${escapeXml(invoice.paymentTerms)}</ram:Description>`,
    '          <ram:DueDateDateTime>',
    `            <udt:DateTimeString format="102">${toBasicDate(invoice.dueAt)}</udt:DateTimeString>`,
    '          </ram:DueDateDateTime>',
    '        </ram:SpecifiedTradePaymentTerms>',
    '        <ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    `          <ram:LineTotalAmount>${amount(totals.lineTotal)}</ram:LineTotalAmount>`,
    totals.allowanceTotal > 0
      ? `          <ram:AllowanceTotalAmount>${amount(totals.allowanceTotal)}</ram:AllowanceTotalAmount>`
      : '',
    `          <ram:TaxBasisTotalAmount>${amount(totals.taxBasis)}</ram:TaxBasisTotalAmount>`,
    `          <ram:TaxTotalAmount currencyID="${CURRENCY}">${amount(totals.taxAmount)}</ram:TaxTotalAmount>`,
    `          <ram:GrandTotalAmount>${amount(totals.grandTotal)}</ram:GrandTotalAmount>`,
    `          <ram:DuePayableAmount>${amount(totals.duePayable)}</ram:DuePayableAmount>`,
    '        </ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    referencedInvoice(invoice),
    '      </ram:ApplicableHeaderTradeSettlement>',
    '  </rsm:SupplyChainTradeTransaction>',
    '</rsm:CrossIndustryInvoice>',
  ]
    .filter((chunk) => chunk !== '')
    .join('\n');
};

export const facturXFileName = (invoice) =>
  `${invoice.number.replace(/[^A-Za-z0-9-]/g, '')}-facturx.xml`;

export const isCreditNoteDocument = isCreditNote;
