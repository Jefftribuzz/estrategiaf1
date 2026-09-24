import { setupCarousel } from './carousel';
import { Showreel } from './showreel';

// Scripts da landing page: vitrine animada das pistas e carrossel das lendas.

function initShowreel() {
  const canvas = document.querySelector<HTMLCanvasElement>('#showreel');
  const dots = document.querySelector<HTMLElement>('#showreel-dots');
  const toggle = document.querySelector<HTMLButtonElement>('#showreel-toggle');
  if (!canvas || !dots || !toggle) return;
  const reel = new Showreel(canvas);
  const labels = ['Baku', 'Mônaco', 'Montreal', 'Silverstone', 'Hungria', 'Spa', 'Monza', 'Suzuka', 'México', 'Interlagos', 'Pódio'];
  dots.innerHTML = labels.map((l, i) => `<button type="button" data-i="${i}" aria-label="Mostrar ${l}" title="${l}"></button>`).join('');
  const buttons = Array.from(dots.children) as HTMLButtonElement[];
  buttons.forEach((b) => b.addEventListener('click', () => reel.goTo(Number(b.dataset.i))));
  reel.onScene = (i) => buttons.forEach((b, j) => b.setAttribute('aria-current', i === j ? 'true' : 'false'));

  const setLabel = () => {
    toggle.textContent = reel.isPlaying ? '❚❚ Pausar' : '▶ Continuar';
    toggle.setAttribute('aria-pressed', reel.isPlaying ? 'false' : 'true');
  };
  toggle.addEventListener('click', () => {
    reel.setPlaying(!reel.isPlaying);
    setLabel();
  });

  // Economiza bateria: só anima quando a vitrine está na tela.
  new IntersectionObserver((entries) => reel.setVisible(entries[0].isIntersecting)).observe(canvas);
  document.addEventListener('visibilitychange', () => reel.setVisible(!document.hidden));

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) reel.setPlaying(false);
  setLabel();
  // Espera a fonte pixelada para as legendas saírem certas no canvas.
  const go = () => {
    reel.start();
    canvas.classList.add('ready');
  };
  if (document.fonts?.ready) document.fonts.ready.then(go, go);
  else go();
}

initShowreel();
document.querySelectorAll<HTMLElement>('[data-carousel]').forEach((el) => setupCarousel(el));
