/**
 * Point d'entrée : vérifie WebGL, choisit la qualité, charge les textures
 * locales puis démarre l'application.
 */

import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/jost/200.css';
import './styles/main.css';
import { App } from './app/App';
import { loadSettings } from './app/settings';
import { parseStartupOptions } from './app/startup';
import { resolveQuality } from './perf/quality';
import { SceneView, createRenderer } from './scene/SceneView';
import { loadTextures } from './scene/textures';

function showFatal(title: string, text: string): void {
  const loading = document.getElementById('loading');
  loading?.remove();
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = `<h1 class="fatal__title"></h1><p class="fatal__text"></p>`;
  box.querySelector('.fatal__title')!.textContent = title;
  box.querySelector('.fatal__text')!.textContent = text;
  document.body.appendChild(box);
}

/** Sonde les capacités WebGL réelles de l'appareil (null si WebGL est absent). */
function probeWebGL(): { webgl2: boolean; maxTextureSize: number } | null {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl') ?? (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    const info = { webgl2: !!gl2, maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return info;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const options = parseStartupOptions(window.location.search);
  const gl = probeWebGL();
  if (!gl) {
    showFatal(
      'Affichage 3D indisponible',
      'Cet appareil ou ce navigateur ne prend pas en charge WebGL, nécessaire à Horloge Cosmique.',
    );
    return;
  }

  const settings = loadSettings();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;

  const device = {
    userAgent: navigator.userAgent,
    webgl2: gl.webgl2,
    maxTextureSize: gl.maxTextureSize,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };

  const qualitySetting = options.quality ?? settings.quality;
  const quality = resolveQuality(qualitySetting, device);
  const renderer = createRenderer(canvas, quality);

  const progress = document.getElementById('loading-progress');
  const textures = await loadTextures(quality, renderer, (loaded, total) => {
    if (progress) progress.style.width = `${Math.round((loaded / total) * 100)}%`;
  });

  const view = new SceneView(renderer, textures, quality);
  const app = new App(view, settings, quality, qualitySetting === 'auto', options);
  app.start();

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFatal('Affichage 3D interrompu', 'Le contexte graphique a été perdu. Relancez l’application.');
  });

  window.setTimeout(() => document.getElementById('loading')?.classList.add('is-done'), 250);
  window.setTimeout(() => document.getElementById('loading')?.remove(), 1500);
}

boot().catch((error: unknown) => {
  console.error(error);
  showFatal('Erreur au démarrage', error instanceof Error ? error.message : String(error));
});
