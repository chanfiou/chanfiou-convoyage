import { html, onClick } from '../core/dom.js';
import { fromHtml } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { COMPANY } from '../config/company.js';

export const renderLegal = () => {
  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <div class="row row--between">
          <h1>Mentions légales</h1>
          <button type="button" class="button button--xs button--link" data-goto="accueil">
            Retour à l’accueil
          </button>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">Éditeur du site</h2>
        <p class="text-small text-muted">
          Chanfiou Entreprise — Moustapha Chanfiou, entrepreneur individuel<br />
          159 Grande Rue, 92310 Sèvres, France<br />
          SIRET : 878 455 203 00025 — RCS Nanterre 878 455 203<br />
          TVA non applicable, article 293 B du CGI<br />
          Téléphone : ${COMPANY.phone} — Courriel : ${COMPANY.email}<br />
          Directeur de la publication : Moustapha Chanfiou
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Hébergement</h2>
        <p class="text-small text-muted">
          Ce site et ses données sont hébergés par Cloudflare, Inc.,<br />
          101 Townsend Street, San Francisco, CA 94107, États-Unis —
          <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Données personnelles</h2>
        <p class="text-small text-muted">
          Les informations saisies lors d’une demande de convoyage (identité et coordonnées du
          demandeur, adresses de prise en charge et de livraison, caractéristiques du véhicule)
          sont collectées par Chanfiou Entreprise, responsable du traitement, pour répondre à la
          demande, exécuter la mission et établir la facturation.
        </p>
        <p class="text-small text-muted">
          Base légale : mesures précontractuelles et exécution du contrat, puis obligations
          comptables. Les données sont conservées pendant la durée de la relation commerciale,
          et les pièces de facturation pendant les durées légales (10 ans). Elles ne sont ni
          vendues ni transmises à des tiers, hors prestataires techniques nécessaires au
          service : hébergement Cloudflare et facturation électronique via la plateforme
          agréée Abby.
        </p>
        <p class="text-small text-muted">
          Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et
          d’opposition sur vos données. Pour l’exercer, écrivez à ${COMPANY.email}. Vous pouvez
          également adresser une réclamation à la CNIL (cnil.fr).
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Cookies et stockage local</h2>
        <p class="text-small text-muted">
          Ce site n’utilise aucun cookie publicitaire ni outil de suivi. Un stockage local
          strictement technique conserve sur votre appareil vos devis et références de suivi ;
          il reste sur votre appareil et peut être effacé en supprimant les données du site
          dans votre navigateur.
        </p>
      </section>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  return view;
};
