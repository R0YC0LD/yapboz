import gsap from 'gsap';
import { unlock } from './vault.js';
import { PUZZLES } from './data.js';

const $ = (id) => document.getElementById(id);
const form = $('gateForm');
const note = $('gateNote');
const button = $('gateBtn');

let vault = null;
let startTable = null;

function loadImage(bytes) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  return img.decode().then(() => img);
}

async function prepare() {
  const [images, video, game] = await Promise.all([
    Promise.all(PUZZLES.map(async (p) => loadImage(await vault.read(`${p.id}.bin`)))),
    vault.read('intro.bin'),
    import('./game.js'),
  ]);
  const url = URL.createObjectURL(new Blob([video], { type: 'video/mp4' }));
  $('introVideo').src = url;
  $('introBlur').src = url;
  await game.prepareGame(images);
  startTable = game.startTable;
}

async function playIntro() {
  $('gate').hidden = true;
  const intro = $('intro');
  intro.hidden = false;
  const video = $('introVideo');
  const blur = $('introBlur');
  let leaving = false;

  const leave = () => {
    if (leaving) return;
    leaving = true;
    gsap
      .timeline({
        onComplete() {
          video.pause();
          blur.pause();
          intro.hidden = true;
          $('stage').style.visibility = 'visible';
          startTable();
          gsap.to('#shade', { opacity: 0, duration: 0.5 });
        },
      })
      .to(video, { scale: 1.05, duration: 1.7, ease: 'power1.in' }, 0)
      .to('#shade', { opacity: 1, duration: 1.5, ease: 'power2.in' }, 0)
      .to(video, { volume: 0, duration: 1.4 }, 0)
      .to({}, { duration: 0.35 });
  };

  video.addEventListener('ended', leave, { once: true });
  $('skipIntro').onclick = leave;

  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play().catch(leave);
  }
  blur.play().catch(() => {});
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (vault && startTable) {
    (await import('./sound.js')).wakeSound();
    playIntro();
    return;
  }
  if (vault) return;

  button.disabled = true;
  note.textContent = '';
  try {
    vault = await unlock($('pass').value);
  } catch {
    note.textContent = 'Bağlantıda sorun var, bir daha dene.';
    button.disabled = false;
    return;
  }
  if (!vault) {
    button.disabled = false;
    note.textContent = 'Bu tarih değil. Bir daha dene.';
    gsap.fromTo(form, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, .3)' });
    return;
  }

  note.style.color = 'var(--palm)';
  note.textContent = 'Doğru. Kutular getiriliyor.';
  button.textContent = 'Hazırlanıyor';
  $('pass').disabled = true;
  try {
    await prepare();
    note.textContent = 'Hazır. Sesini aç.';
    button.textContent = 'Başlat';
    button.disabled = false;
    button.focus();
  } catch (err) {
    console.error(err);
    note.style.color = '';
    note.textContent = 'Bir şey yüklenemedi, sayfayı yenile.';
  }
});

$('stage').style.visibility = 'hidden';
