import { SoundSheet } from './ui/SoundSheet';
import { render } from 'preact';
import { gameAudio } from './game/audio';
import { music } from './game/music';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import './style.css';

// Browsers only allow sound once the player has pressed or tapped something: any such press wakes it.
for (const type of ['keydown', 'pointerdown', 'touchstart']) {
  window.addEventListener(
    type,
    () => {
      gameAudio.unlock();
      // The menu theme starts on the first press, if it was waiting for sound to be allowed.
      setTimeout(() => music.wake(), 60);
    },
    { passive: true },
  );
}

const query = new URLSearchParams(location.search);
if (query.has('sheet')) {
  // Every piece of drawn art on one page, for checking it together.
  document.body.className = 'mode-menu mode-sheet';
  render(<ArtSheet />, document.getElementById('menu') as HTMLElement);
} else if (query.has('sound')) {
  // Every sound and tune on one page, each with a button to hear it.
  document.body.className = 'mode-menu mode-sheet';
  render(<SoundSheet />, document.getElementById('menu') as HTMLElement);
} else render(<App />, document.getElementById('menu') as HTMLElement);
