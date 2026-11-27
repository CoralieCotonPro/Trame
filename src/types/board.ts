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

/** Coin du rectangle englobant où commence le trait ; il finit au coin opposé. */
export type LineCorner = 'tl' | 'tr' | 'bl' | 'br';

/** Côté d'un élément où s'accroche une flèche. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface LineElement extends ElementBase {
  type: 'line';
  /** Texte écrit sur le trait, au milieu. */
  content: { text?: string };
  style: {
    color: string;
    thickness: 'thin' | 'thick';
    arrow: 'none' | 'end';
    start: LineCorner;
    /**
     * Élément auquel est accroché le départ (`from`) ou l'arrivée (`to`), et le côté choisi.
     * Une chaîne vide signifie que l'extrémité est libre : elle suit alors le rectangle englobant.
     */
    from?: string;
    fromSide?: Side | '';
    to?: string;
    toSide?: Side | '';
    /**
     * Tracé : `elbow` à angles droits, `straight` en ligne droite. Absent ou vide :
     * coudé dès qu'une extrémité est accrochée, droit sinon.
     */
    route?: LineRoute | '';
  };
}

export type LineRoute = 'straight' | 'elbow';

/** Losange de diagramme de décision : un texte centré. */
export interface DiamondElement extends ElementBase {
  type: 'diamond';
  content: { text: string };
  style: { color: string };
}

export type BoardElement = PostitElement | TextElement | LineElement | DiamondElement;

export interface ElementPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  content?:
    | Partial<PostitElement['content']>
    | Partial<TextElement['content']>
    | Partial<LineElement['content']>;
  style?:
    | Partial<PostitElement['style']>
    | Partial<TextElement['style']>
    | Partial<LineElement['style']>;
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
