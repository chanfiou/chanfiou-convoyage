// Pad de signature manuscrite partagé par les procès-verbaux (côté convoyeur)
// et la signature du contrat (côté client).
export const bindSignaturePad = (canvas) => {
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
    isEmpty: () => !hasContent,
    toDataUrl: () => (hasContent ? canvas.toDataURL('image/png') : null),
  };
};
