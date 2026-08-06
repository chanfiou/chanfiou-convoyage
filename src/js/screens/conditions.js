import { html, onClick } from '../core/dom.js';
import { fromHtml } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { COMPANY, PAYMENT } from '../config/company.js';

export const TERMS_VERSION = '1.0 — août 2026';

const section = (title, ...paragraphs) => html`
  <section class="card">
    <h2 class="card-title">${title}</h2>
    ${paragraphs.map((text) => html`<p class="text-small text-muted">${text}</p>`).join('')}
  </section>
`;

export const renderConditions = () => {
  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <div class="row row--between">
          <h1>Conditions générales</h1>
          <button type="button" class="button button--xs button--link" data-goto="accueil">
            Retour à l’accueil
          </button>
        </div>
        <p class="text-muted">Conditions générales de convoyage — version ${TERMS_VERSION}.</p>
      </header>

      ${section(
        '1. Objet',
        `Les présentes conditions encadrent les prestations de convoyage de véhicules par la route
        réalisées par ${COMPANY.name} (le « convoyeur ») pour le compte du client. Le véhicule est
        conduit par le convoyeur lui-même du lieu de prise en charge au lieu de livraison convenus.`,
      )}
      ${section(
        '2. Devis et commande',
        `Le prix est établi par le devis en ligne selon la distance, le type de véhicule, la date de
        prise en charge et les options choisies. Il est ferme et inclut péages, carburant et
        assurance. La demande envoyée par le client vaut commande ; le contrat est formé à la
        confirmation de la demande par le convoyeur.`,
      )}
      ${section(
        '3. Paiement',
        `La facture est émise après confirmation. La prestation est payable avant le départ, par
        virement bancaire (bénéficiaire : ${PAYMENT.holder}). Le convoyage n’est engagé qu’après
        réception du paiement.`,
      )}
      ${section(
        '4. Obligations du client',
        `Le client garantit que le véhicule est en état de circuler, régulièrement assuré et muni de
        ses documents de bord (certificat d’immatriculation, attestation d’assurance), avec un jeu
        de clés complet. Il signale toute particularité (panne, fuite, alarme, gabarit) avant la
        prise en charge.`,
      )}
      ${section(
        '5. État des lieux et procès-verbaux',
        `Un procès-verbal contradictoire (points de contrôle, kilométrage, carburant, photographies
        horodatées, signature) est établi à la prise en charge et à la livraison. Les réserves à la
        livraison sont mentionnées sur le procès-verbal ; à défaut, le client dispose de 48 heures
        après la livraison pour formuler des réserves écrites.`,
      )}
      ${section(
        '6. Assurance et responsabilité',
        `Le convoyeur est couvert par une assurance responsabilité civile professionnelle et une
        garantie du véhicule confié à hauteur de ${COMPANY.insurance.coverage.toLocaleString('fr-FR')} €
        pendant toute la mission. La responsabilité du convoyeur ne couvre ni les vices propres du
        véhicule, ni les objets laissés à bord non déclarés.`,
      )}
      ${section(
        '7. Report et annulation',
        `Le client peut annuler sans frais tant que la demande n’est pas confirmée. Après paiement,
        l’annulation par le client donne lieu à un report gratuit à une autre date disponible ou à
        un remboursement, déduction faite des frais déjà engagés. Le convoyeur peut reporter la
        mission en cas de force majeure ou d’état du véhicule non conforme ; le client en est
        informé immédiatement.`,
      )}
      ${section(
        '8. Données personnelles et litiges',
        `Les données du client sont traitées conformément à la page « Mentions légales et données
        personnelles ». Les présentes conditions sont soumises au droit français ; en cas de
        litige, une solution amiable est recherchée avant toute action.`,
      )}
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  return view;
};
