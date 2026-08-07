import { html, onClick } from '../core/dom.js';
import { fromHtml } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { COMPANY, PAYMENT } from '../config/company.js';

export const TERMS_VERSION = '2.0 — août 2026';

const COVERAGE = COMPANY.insurance.coverage.toLocaleString('fr-FR');

const article = (title, ...paragraphs) => html`
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
        <p class="text-muted">
          Conditions générales de prestation de convoyage — version ${TERMS_VERSION}.
        </p>
      </header>

      ${article(
        'Article 1 — Identification et champ d’application',
        `Les présentes conditions générales régissent les prestations de convoyage de véhicules par
        la route réalisées par Moustapha Chanfiou, entrepreneur individuel exerçant sous le nom
        commercial ${COMPANY.name}, 159 Grande Rue, 92310 Sèvres, SIRET 878 455 203 00025,
        téléphone ${COMPANY.phone}, courriel ${COMPANY.email} (ci-après « le convoyeur »).`,
        `Elles s’appliquent à toute demande de convoyage adressée par un client professionnel ou
        par un consommateur (ci-après « le client »), à l’exclusion de toute autre condition. Les
        stipulations propres aux consommateurs sont signalées comme telles ; celles propres aux
        professionnels également. Le convoyage consiste à conduire soi-même le véhicule confié du
        lieu de prise en charge au lieu de livraison convenus : il ne s’agit ni d’un transport sur
        plateau, ni d’une location, ni d’un dépannage.`,
      )}

      ${article(
        'Article 2 — Devis, commande et formation du contrat',
        `Le devis établi par l’application est ferme pour le trajet, le véhicule, la date de prise
        en charge et les options renseignés par le client. Toute modification de ces éléments donne
        lieu à un nouveau devis. Le devis est valable sept jours et sans engagement.`,
        `L’envoi de la demande par le client vaut commande. Le contrat est formé lorsque le
        convoyeur confirme la demande, ce dont le client est informé par notification et sur son
        écran de suivi. Le contrat de convoyage est alors mis à sa disposition et sa signature
        électronique conditionne l’émission de la facture, puis l’exécution de la prestation.`,
      )}

      ${article(
        'Article 3 — Prix',
        `Les prix sont exprimés en euros. Le convoyeur relève de la franchise en base de TVA :
        « TVA non applicable, article 293 B du CGI ». Aucune TVA n’est due ni récupérable.`,
        `Le prix comprend la conduite du véhicule, les péages, le carburant nécessaire au trajet,
        l’assurance mentionnée à l’article 9, le déplacement d’approche et de retour du convoyeur
        dans la limite indiquée au devis, ainsi que les procès-verbaux photographiques. Sont exclus
        et facturés en supplément, après information du client : les temps d’attente au-delà de
        trente minutes sur place, les prestations complémentaires expressément commandées, et les
        frais exposés du fait d’une information erronée fournie par le client.`,
      )}

      ${article(
        'Article 4 — Facturation et paiement',
        `La facture est émise après signature du contrat. Elle est établie au format électronique et
        transmise via une plateforme de dématérialisation agréée par l’administration fiscale,
        conformément au calendrier légal de la facturation électronique.`,
        `Le prix est payable intégralement avant le départ, par virement bancaire au bénéfice de
        ${PAYMENT.holder}. Le convoyage n’est engagé qu’après réception effective des fonds. La
        date de prise en charge réservée est maintenue pendant quarante-huit heures à compter de
        l’émission de la facture ; à défaut de paiement dans ce délai, le convoyeur peut proposer
        une nouvelle date selon ses disponibilités.`,
        `Client professionnel : conformément à l’article L441-10 du code de commerce, tout retard de
        paiement entraîne de plein droit des pénalités égales à trois fois le taux d’intérêt légal,
        ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement, sans préjudice des
        frais de recouvrement exposés. Aucun escompte n’est accordé pour paiement anticipé.`,
        `Client consommateur : les sommes non réglées à l’échéance portent intérêt au taux d’intérêt
        légal après mise en demeure restée sans effet.`,
      )}

      ${article(
        'Article 5 — Droit de rétractation (clients consommateurs)',
        `Le consommateur qui conclut le contrat à distance dispose d’un délai de quatorze jours à
        compter de la formation du contrat pour se rétracter sans motif ni pénalité, conformément à
        l’article L221-18 du code de la consommation. Il exerce ce droit par tout moyen écrit
        adressé à ${COMPANY.email} ou ${COMPANY.phone}.`,
        `Lorsque le convoyage doit être exécuté avant l’expiration de ce délai, le consommateur
        demande expressément son exécution immédiate en acceptant les présentes conditions lors de
        l’envoi de sa demande. Conformément à l’article L221-25 du même code, il perd son droit de
        rétractation dès l’exécution complète de la prestation ; si la prestation est en cours
        d’exécution au moment de la rétractation, il reste redevable du montant correspondant à ce
        qui a déjà été fourni.`,
        `Ce droit de rétractation n’est pas applicable aux clients professionnels commandant dans le
        cadre de leur activité.`,
      )}

      ${article(
        'Article 6 — Obligations et déclarations du client',
        `Le client garantit être propriétaire du véhicule ou dûment mandaté pour en confier le
        convoyage. Il garantit que le véhicule est en état de circuler, contrôle technique et
        assurance en cours de validité couvrant la conduite par un tiers, et qu’il est muni à bord
        du certificat d’immatriculation, de l’attestation d’assurance et d’un jeu de clés complet.`,
        `Le client déclare avant la prise en charge toute particularité du véhicule : panne connue,
        fuite, voyant allumé, pneumatiques usés, alarme, gabarit ou hauteur inhabituels, boîte
        spécifique, carburant particulier. Il s’engage à ne laisser à bord aucun objet de valeur ni
        aucune marchandise non déclarée.`,
        `Le client assure la présence, aux lieux et dates convenus, de lui-même ou d’une personne
        qu’il mandate, afin d’établir contradictoirement les procès-verbaux de prise en charge et de
        livraison. Le nom du signataire est mentionné sur chaque procès-verbal.`,
      )}

      ${article(
        'Article 7 — Exécution, procès-verbaux et réserves',
        `Un procès-verbal contradictoire est établi lors de la prise en charge puis lors de la
        livraison. Il mentionne le kilométrage, le niveau de carburant, les points de contrôle, les
        réserves éventuelles, et comporte des photographies horodatées ainsi que la signature du
        client ou de son mandataire. Les deux procès-verbaux sont accessibles au client depuis son
        écran de suivi et téléchargeables.`,
        `Les réserves relatives à l’état du véhicule doivent être portées sur le procès-verbal de
        livraison. À défaut, le client dispose de quarante-huit heures à compter de la livraison
        pour formuler par écrit des réserves motivées, accompagnées de tout élément probant. Passé
        ce délai, le véhicule est réputé livré conforme à son état de prise en charge, sans que
        cette stipulation ne fasse obstacle aux droits que le consommateur tire de la loi.`,
        `Le convoyeur exécute personnellement la prestation et ne recourt à aucune sous-traitance
        sans l’accord préalable et écrit du client.`,
      )}

      ${article(
        'Article 8 — Amendes et infractions',
        `Les contraventions constatées pendant le convoyage et imputables à la conduite du
        convoyeur restent à sa charge exclusive, y compris les frais et majorations
        correspondants ; il en assume la désignation auprès de l’autorité compétente.`,
        `Demeurent à la charge du client les amendes et frais résultant de l’état du véhicule ou de
        sa situation administrative avant la prise en charge, notamment défaut de contrôle
        technique, défaut d’assurance, immobilisation ou stationnement antérieur.`,
      )}

      ${article(
        'Article 9 — Assurance et responsabilité',
        `Le convoyeur est titulaire d’une assurance de responsabilité civile professionnelle et
        d’une garantie du véhicule confié à hauteur de ${COVERAGE} € par sinistre, couvrant le
        véhicule pendant toute la durée de la mission. Le client peut en obtenir l’attestation sur
        simple demande.`,
        `Le convoyeur répond des dommages matériels causés au véhicule pendant le convoyage, dans
        les limites de cette garantie et des franchises applicables. Sa responsabilité ne s’étend
        pas aux vices propres et à l’usure du véhicule, aux pannes indépendantes de la conduite,
        aux dommages résultant d’une information erronée ou incomplète du client, aux objets et
        marchandises laissés à bord non déclarés, ni aux cas de force majeure.`,
        `Client professionnel : la responsabilité du convoyeur au titre des préjudices immatériels,
        notamment perte d’exploitation ou perte de chance, est limitée au montant de la prestation
        concernée. Cette limitation ne s’applique ni aux dommages corporels, ni à la faute
        lourde ou dolosive, ni aux clients consommateurs.`,
      )}

      ${article(
        'Article 10 — Report, annulation et force majeure',
        `Le client peut annuler sans frais tant que la demande n’a pas été confirmée. Après
        paiement, l’annulation à l’initiative du client ouvre droit, à son choix, au report gratuit
        de la mission à une date disponible ou au remboursement des sommes versées, déduction faite
        des frais déjà réellement exposés par le convoyeur et justifiés.`,
        `Le convoyeur peut refuser la prise en charge ou reporter la mission si le véhicule ne
        remplit pas les conditions de l’article 6, si sa conduite présenterait un danger, ou en cas
        de force majeure. Le client en est informé sans délai et les sommes versées lui sont
        remboursées si la mission n’est pas reportée.`,
      )}

      ${article(
        'Article 11 — Signature électronique et preuve',
        `Le contrat et les procès-verbaux sont signés électroniquement dans l’application. Les
        parties conviennent, conformément aux articles 1366 et 1367 du code civil, que ces
        signatures, l’horodatage des acceptations et les photographies enregistrées constituent
        entre elles des preuves recevables de leurs engagements et de l’état du véhicule.`,
      )}

      ${article(
        'Article 12 — Réclamations et médiation',
        `Toute réclamation est adressée à ${COMPANY.email} ou ${COMPANY.phone}. Le convoyeur
        s’engage à répondre dans un délai de quinze jours.`,
        `Client consommateur : conformément à l’article L612-1 du code de la consommation, après
        démarche écrite préalable restée infructueuse, le consommateur peut recourir gratuitement au
        médiateur de la consommation dont les coordonnées sont communiquées sur demande et
        rappelées sur les factures. La plateforme européenne de règlement en ligne des litiges est
        également accessible en ligne.`,
      )}

      ${article(
        'Article 13 — Données personnelles',
        `Les données communiquées sont traitées pour l’exécution du contrat, la facturation et le
        suivi de la mission, dans les conditions détaillées à la page « Mentions légales et données
        personnelles », qui précise les durées de conservation, les destinataires et les droits du
        client, ainsi que les voies de recours auprès de la CNIL.`,
      )}

      ${article(
        'Article 14 — Droit applicable et litiges',
        `Les présentes conditions sont soumises au droit français. Les parties recherchent une
        solution amiable avant toute action.`,
        `À défaut d’accord, le litige est porté devant la juridiction compétente selon les règles de
        droit commun. Le consommateur conserve la faculté de saisir la juridiction du lieu de son
        domicile ou du lieu d’exécution de la prestation.`,
      )}

      <section class="card card--flat">
        <p class="text-small text-muted">
          Version ${TERMS_VERSION}. Le convoyeur peut modifier les présentes conditions ; la
          version applicable est celle acceptée par le client lors de l’envoi de sa demande, dont la
          date est conservée et reportée sur son contrat.
        </p>
      </section>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  return view;
};
