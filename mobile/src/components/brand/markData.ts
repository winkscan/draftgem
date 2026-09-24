// Geometry of the DraftGem mark (assets/mark.svg, viewBox 136x140): eight gem facets around a
// black octagon that carries the letter G. Facets are listed clockwise starting at the top right,
// which is the order the splash reveals them in.

export const MARK_W = 136;
export const MARK_H = 140;

export interface Facet {
  d: string;
  /** Linear gradient in user-space coordinates, from stop 0 to stop 1. */
  grad: { x1: number; y1: number; x2: number; y2: number; from: string; to: string };
}

export const FACETS: Facet[] = [
  // 1 top right
  { d: "M80 36L100 54L136 34L102 0L80 36Z", grad: { x1: 118, y1: 16, x2: 90, y2: 44.5, from: "#50F8CA", to: "#3EF6C0" } },
  // 2 right
  { d: "M136 34L100 54V86L136 106V34Z", grad: { x1: 136, y1: 70, x2: 100, y2: 70, from: "#8538FC", to: "#641BFB" } },
  // 3 bottom right
  { d: "M80 104L100 86L136 106L102 140L80 104Z", grad: { x1: 136, y1: 106, x2: 80, y2: 113, from: "#873EFD", to: "#5A42F0" } },
  // 4 bottom
  { d: "M34 140L56 104H80L102 140H34Z", grad: { x1: 68, y1: 104, x2: 68, y2: 140, from: "#6B69FD", to: "#4F44E8" } },
  // 5 bottom left
  { d: "M56 104L36 86L0 106L34 140L56 104Z", grad: { x1: 47, y1: 94.5, x2: 18.5, y2: 123, from: "#5221FC", to: "#7523FC" } },
  // 6 left
  { d: "M0 34L36 54V86L0 106V34Z", grad: { x1: 36, y1: 70, x2: 0, y2: 70, from: "#3C72DF", to: "#5295F3" } },
  // 7 top left
  { d: "M56 36L36 54L0 34L34 0L56 36Z", grad: { x1: 19, y1: 16.5, x2: 45, y2: 47, from: "#49D4F3", to: "#388DDC" } },
  // 8 top
  { d: "M34 0L56 36H80L102 0H34Z", grad: { x1: 68, y1: 0, x2: 68, y2: 36, from: "#4EE8D6", to: "#29BAC6" } },
];

/** The black octagon in the middle. */
export const CORE_D = "M36 54L56 36H80L100 54V86L80 104H56L36 86V54Z";

/** The white letter G on it. */
export const G_D = "M80 46L90 56V60H82L76 54H60L54 60V80L60 86H76L82 80V74H68V66H90V84L80 94H56L46 84V56L56 46H80Z";
