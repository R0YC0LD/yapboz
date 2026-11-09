import gsap from 'gsap';
import { prefetch, unlock } from './vault.js';
import { PUZZLES } from './data.js';

const $ = (id) => document.getElementById(id);
const form = $('gateForm');
const note = $('gateNote');
const button = $('gateBtn');

let vault = null;
let introReady = false;
let tableReady = null;

const gameModule = import('./game.js');
['index.json', 'check.bin', 'intro.bin', ...PUZZLES.map((p) => `${p.id}.bin`)].forEach((name) => prefetch(name).catch(() => {}));

function loadImage(bytes) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  return img.decode().then(() => img);
}

async function prepareTable() {
  const [images, game] = await Promise.all([
    Promise.all(PUZZLES.map(async (p) => loadImage(await vault.read(`${p.id}.bin`)))),
    gameModule,
  ]);
  await game.prepareGame(images);
  return game.startTable;
}

async function prepareIntro() {
  const video = await vault.read('intro.bin');
  const url = URL.createObjectURL(new Blob([video], { type: 'video/mp4' }));
  $('introVideo').src = url;
  $('introBlur').src = url;
}

async function openTable() {
  const shadeNote = $('shadeNote');
  const slow = setTimeout(() => (shadeNote.hidden = false), 300);
  try {
    const startTable = await tableReady;
    clearTimeout(slow);
    shadeNote.hidden = true;
    $('stage').style.visibility = 'visible';
    startTable();
    gsap.to('#shade', { opacity: 0, duration: 0.5 });
  } catch (err) {
    clearTimeout(slow);
    console.error(err);
    shadeNote.hidden = false;
    shadeNote.textContent = 'Bir şey yüklenemedi, sayfayı yenile.';
  }
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
          openTable();
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
  if (vault && introReady) {
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
  tableReady = prepareTable();
  tableReady.catch(() => {});
  try {
    await prepareIntro();
    introReady = true;
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
