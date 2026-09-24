// Carrossel acessível: rola com o dedo (scroll-snap), setas, pontos e
// avanço automático que pausa quando a pessoa interage.

export function setupCarousel(root: HTMLElement, intervalMs = 3500) {
  const track = root.querySelector<HTMLElement>('.carousel-track')!;
  const slides = Array.from(track.children) as HTMLElement[];
  const dots = root.querySelector<HTMLElement>('.carousel-dots')!;
  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = reduce;
  let timer = 0;

  dots.innerHTML = slides
    .map((s, i) => `<button type="button" aria-label="Ir para ${s.dataset.name ?? `item ${i + 1}`}" data-i="${i}"></button>`)
    .join('');
  const dotButtons = Array.from(dots.children) as HTMLButtonElement[];

  const current = () => {
    const left = track.scrollLeft;
    let best = 0;
    slides.forEach((s, i) => {
      if (Math.abs(s.offsetLeft - track.offsetLeft - left) < Math.abs(slides[best].offsetLeft - track.offsetLeft - left)) best = i;
    });
    return best;
  };
  const go = (i: number) => {
    const n = (i + slides.length) % slides.length;
    track.scrollTo({ left: slides[n].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  };
  const update = () => {
    const c = current();
    dotButtons.forEach((d, i) => d.setAttribute('aria-current', i === c ? 'true' : 'false'));
  };
  const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;

  prev.addEventListener('click', () => go(current() - 1));
  next.addEventListener('click', () => (atEnd() ? go(0) : go(current() + 1)));
  dotButtons.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.i))));
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });

  const pause = () => (paused = true);
  const resume = () => (paused = reduce);
  root.addEventListener('mouseenter', pause);
  root.addEventListener('mouseleave', resume);
  root.addEventListener('focusin', pause);
  root.addEventListener('focusout', resume);
  track.addEventListener('touchstart', pause, { passive: true });

  const tick = () => {
    if (!paused && !document.hidden) atEnd() ? go(0) : go(current() + 1);
  };
  timer = window.setInterval(tick, intervalMs);
  update();
  return () => clearInterval(timer);
}
