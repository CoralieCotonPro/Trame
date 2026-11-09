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
  content: { body: string };
  style: { color: string };
  /** Identifiant de valeur par catégorie : libellés et couleurs restent dans le catalogue. */
  tags: Record<string, string>;
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
  /** Par catégorie : l'identifiant de la nouvelle valeur, ou `null` pour retirer le tag. */
  tags?: Record<string, string | null>;
}

export interface TagCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface TagValue {
  id: string;
  categoryId: string;
  label: string;
  color: string;
  sortOrder: number;
}

/** Valeurs retenues, par catégorie. */
export type TagFilters = Record<string, string[]>;

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
