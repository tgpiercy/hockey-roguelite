import { render } from 'preact';
import { gameAudio } from './game/audio';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import './style.css';

// Browsers only allow sound once the player has pressed or tapped something: any such press wakes it.
for (const type of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(type, () => gameAudio.unlock(), { passive: true });

const query = new URLSearchParams(location.search);
if (query.has('sheet')) {
  // Every piece of drawn art on one page, for checking it together.
  document.body.className = 'mode-menu mode-sheet';
  render(<ArtSheet />, document.getElementById('menu') as HTMLElement);
} else render(<App />, document.getElementById('menu') as HTMLElement);
