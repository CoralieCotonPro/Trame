export type TextLevel = 'h1' | 'h2' | 'h3' | 'body' | 'small';
export type TextAlign = 'left' | 'center' | 'right';

interface ElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Hauteur minimale souhaitée. La hauteur affichée s'adapte au contenu. */
  height: number;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
}

export interface PostitElement extends ElementBase {
  type: 'postit';
  content: { title: string; body: string };
  style: { color: string };
}

export interface TextElement extends ElementBase {
  type: 'text';
  content: { text: string };
  style: { level: TextLevel; color: string; align: TextAlign };
}

export type BoardElement = PostitElement | TextElement;

export interface ElementPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  content?: Partial<PostitElement['content']> | Partial<TextElement['content']>;
  style?: Partial<PostitElement['style']> | Partial<TextElement['style']>;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Camera extends Point {
  zoom: number;
}
