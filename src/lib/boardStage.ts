import type Konva from 'konva';

let stage: Konva.Stage | null = null;

export function registerBoardStage(value: Konva.Stage | null) {
  stage = value;
}

/** Accès à la scène Konva pour les exports visuels. */
export function getBoardStage(): Konva.Stage | null {
  return stage;
}
