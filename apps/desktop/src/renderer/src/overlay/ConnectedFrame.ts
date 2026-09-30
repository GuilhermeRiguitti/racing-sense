import type { OverlayFrameDto } from '../../../shared/overlay.js';

/** O quadro de quando há sessão no sim: é o único que os widgets desenham. */
export type ConnectedFrame = Extract<OverlayFrameDto, { readonly state: 'connected' }>;
