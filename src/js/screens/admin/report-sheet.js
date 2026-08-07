import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { openSheet, showToast } from '../../core/ui.js';
import { CHECKLIST_ITEMS, updateMission } from '../../domain/mission.js';
import { isConfigured, isSignedIn, uploadReportPhoto } from '../../data/api.js';

const MAX_PHOTOS = 12;
// Les photos partent sur le stockage distant : on peut viser une vraie
// qualité de preuve sans alourdir la synchronisation.
const PHOTO_MAX_SIZE = 1280;

const readImageAsThumbnail = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Image illisible'));
      image.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const bindSignaturePad = (canvas) => {
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  context.scale(ratio, ratio);
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.strokeStyle = '#eaf0f6';

  let drawing = false;
  let hasContent = false;

  const positionOf = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    hasContent = true;
    canvas.setPointerCapture(event.pointerId);
    const point = positionOf(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const point = positionOf(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  canvas.addEventListener('pointerup', () => {
    drawing = false;
  });

  return {
    clear: () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      hasContent = false;
    },
    toDataUrl: () => (hasContent ? canvas.toDataURL('image/png') : null),
  };
};

const checklistMarkup = (existing) => html`
  <div class="option-list">
    ${CHECKLIST_ITEMS.map(
      (item) => html`
        <label class="option ${existing?.checklist?.[item.id] ? 'option--selected' : ''}">
          <input type="checkbox" name="checklist" value="${item.id}" ${existing?.checklist?.[item.id] ? 'checked' : ''} />
          <span class="option__body">
            <span class="option__label">${escapeHtml(item.label)}</span>
          </span>
        </label>
      `,
    )}
  </div>
`;

export const openReportSheet = (mission, stage, onSaved) => {
  const isDeparture = stage === 'departure';
  const existing = isDeparture ? mission.departureReport : mission.arrivalReport;
  const title = isDeparture ? 'Procès-verbal de prise en charge' : 'Procès-verbal de livraison';

  const sheet = openSheet(
    title,
    html`
      <form class="stack-lg" data-report-form>
        <div class="field">
          <label class="field__label" for="mileage">Kilométrage au compteur</label>
          <input
            class="input"
            id="mileage"
            name="mileage"
            type="number"
            min="0"
            inputmode="numeric"
            value="${existing?.mileage ?? ''}"
          />
        </div>
        <div class="field">
          <label class="field__label" for="fuelLevel">Niveau de carburant</label>
          <select class="select" id="fuelLevel" name="fuelLevel">
            ${['Réservoir plein', '3/4', '1/2', '1/4', 'Réserve'].map(
              (level) => html`<option ${existing?.fuelLevel === level ? 'selected' : ''}>${level}</option>`,
            )}
          </select>
        </div>
        <div class="field">
          <span class="field__label">Points de contrôle</span>
          ${checklistMarkup(existing)}
        </div>
        <div class="field">
          <label class="field__label" for="damages">Réserves et dommages constatés</label>
          <textarea class="textarea" id="damages" name="damages" placeholder="Aucune réserve, ou description précise.">${escapeHtml(existing?.damages ?? '')}</textarea>
        </div>
        <div class="field">
          <span class="field__label">Photos horodatées</span>
          <label class="button button--s button--stroke">
            ${icon('camera', 24)} Ajouter des photos
            <input class="visually-hidden" type="file" accept="image/*" capture="environment" multiple data-photo-input />
          </label>
          <div class="photo-grid" data-photo-grid></div>
          <p class="field__hint" data-photo-count>0 photo sur ${MAX_PHOTOS}</p>
        </div>
        <div class="field">
          <span class="field__label">Signature du client</span>
          <canvas class="signature-pad" data-signature></canvas>
          <button type="button" class="button button--xs button--link" data-clear-signature>
            Effacer la signature
          </button>
        </div>
        <div class="field">
          <label class="field__label" for="signatoryName">Nom du signataire</label>
          <input class="input" id="signatoryName" name="signatoryName" type="text" value="${escapeHtml(existing?.signatoryName ?? '')}" />
        </div>
        <p class="field__error" data-report-error hidden></p>
        <button type="submit" class="button button--m button--primary button--full">
          ${icon('check', 24)} Enregistrer le procès-verbal
        </button>
      </form>
    `,
  );

  const root = sheet.element;
  const photos = [...(existing?.photos ?? [])];
  const grid = root.querySelector('[data-photo-grid]');
  const photoCount = root.querySelector('[data-photo-count]');
  const errorLine = root.querySelector('[data-report-error]');
  const signature = bindSignaturePad(root.querySelector('[data-signature]'));

  const renderPhotos = () => {
    grid.innerHTML = photos
      .map(
        (source, index) => html`
          <div class="photo-grid__item">
            <img src="${source}" alt="Photo ${index + 1} du véhicule" />
            <button type="button" class="photo-grid__remove" data-remove-photo="${index}" aria-label="Retirer la photo ${index + 1}">
              ${icon('close', 16)}
            </button>
          </div>
        `,
      )
      .join('');
    photoCount.textContent = `${photos.length} photo${photos.length > 1 ? 's' : ''} sur ${MAX_PHOTOS}`;
  };

  root.querySelector('[data-photo-input]').addEventListener('change', async (event) => {
    const files = [...event.target.files].slice(0, MAX_PHOTOS - photos.length);
    try {
      const thumbnails = await Promise.all(files.map(readImageAsThumbnail));
      photos.push(...thumbnails);
      renderPhotos();
    } catch {
      showToast('Une photo n’a pas pu être ajoutée. Réessayez avec une autre image.', 'danger');
    }
    event.target.value = '';
  });

  onClick(root, '[data-remove-photo]', (target) => {
    photos.splice(Number(target.dataset.removePhoto), 1);
    renderPhotos();
  });

  onClick(root, '[data-clear-signature]', () => signature.clear());

  root.querySelector('[data-report-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (!String(data.mileage ?? '').trim()) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Renseignez le kilométrage relevé au compteur avant d’enregistrer.`;
      root.querySelector('#mileage').focus();
      return;
    }

    // Les photos encore locales partent vers le stockage distant : la mission
    // synchronisée ne contient plus que des adresses, jamais les images.
    const submitButton = form.querySelector('button[type="submit"]');
    if (isConfigured() && isSignedIn() && photos.some((entry) => String(entry).startsWith('data:'))) {
      submitButton.disabled = true;
      submitButton.textContent = 'Envoi des photos…';
      let failures = 0;
      for (let index = 0; index < photos.length; index += 1) {
        if (!String(photos[index]).startsWith('data:')) continue;
        const { data: uploaded, error } = await uploadReportPhoto(mission.reference, photos[index]);
        if (error || !uploaded?.url) failures += 1;
        else photos[index] = uploaded.url;
      }
      submitButton.disabled = false;
      submitButton.textContent = 'Enregistrer le procès-verbal';
      if (failures > 0) {
        showToast(
          `${failures} photo(s) restée(s) sur cet appareil (hors-ligne ?). Elles repartiront au prochain enregistrement.`,
          'danger',
        );
      }
    }

    const checkedItems = [...form.querySelectorAll('input[name="checklist"]:checked')].map(
      (element) => element.value,
    );
    const report = {
      completedAt: new Date().toISOString(),
      mileage: Number(data.mileage),
      fuelLevel: data.fuelLevel,
      damages: String(data.damages ?? '').trim(),
      signatoryName: String(data.signatoryName ?? '').trim(),
      signature: signature.toDataUrl() ?? existing?.signature ?? null,
      photos,
      checklist: Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, checkedItems.includes(item.id)])),
    };

    updateMission(mission.id, isDeparture ? { departureReport: report } : { arrivalReport: report });
    sheet.close();
    showToast(`${title} enregistré.`);
    onSaved?.();
  });

  renderPhotos();
};
