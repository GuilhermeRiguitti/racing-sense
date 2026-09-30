import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isWidgetId } from '../../shared/overlay.js';
import { App } from './App.js';
import { OverlayRoot } from './overlay/OverlayRoot.js';
import './styles.css';
import './overlay/overlay.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('elemento #root não encontrado');
}

/**
 * A mesma página serve a janela do app e as janelas do overlay (ADR 0025): a
 * query `?overlay=<widget>` diz que esta é uma janela de widget, transparente,
 * sempre escura — ela fica por cima do sim, não do tema do Windows.
 */
const widget = new URLSearchParams(window.location.search).get('overlay');
if (isWidgetId(widget)) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.classList.add('is-overlay');
  document.title = `Overlay · ${widget}`;
}

createRoot(container).render(
  <StrictMode>{isWidgetId(widget) ? <OverlayRoot widget={widget} /> : <App />}</StrictMode>,
);
