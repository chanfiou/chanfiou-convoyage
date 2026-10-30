// Pad de signature manuscrite partagé par les procès-verbaux (côté convoyeur)
// et la signature du contrat (côté client).
export const bindSignaturePad = (canvas) => {
  const context = canvas.getContext('2d');
  
  // 1. S'assurer que le canvas a des dimensions par défaut si le CSS ne les fournit pas encore
  const width = canvas.offsetWidth || canvas.clientWidth || 300;
  const height = canvas.offsetHeight || canvas.clientHeight || 150;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);

  context.lineWidth = 2;
  context.lineCap = 'round';
  context.strokeStyle = '#333333';

  // 2. Forcer les styles CSS essentiels pour le tactile et le curseur
  canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>') 0 20, pointer`;
  canvas.style.touchAction = 'none'; // CRUCIAL sur iOS / tactiles pour éviter le scroll à la place du dessin

  let drawing = false;
  let hasContent = false;

  const getPos = (event) => {
    const bounds = canvas.getBoundingClientRect();
    // Récupère les coordonnées tactiles ou souris de manière unifiée
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    drawing = true;
    hasContent = true;
    const point = getPos(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const draw = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const point = getPos(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event) => {
    if (!drawing) return;
    drawing = false;
  };

  // Écouteurs globaux (Souris + Tactile pour couvrir 100% des cas)
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);

  return {
    clear: () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      hasContent = false;
    },
    isEmpty: () => !hasContent,
    toDataUrl: () => (hasContent ? canvas.toDataURL('image/png') : null),
  };
};
