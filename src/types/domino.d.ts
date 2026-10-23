// The bundled declaration names the unscoped "domino" module; Turndown uses
// the scoped fork. Declare only the API this converter needs.
declare module "@mixmark-io/domino" {
  export function createDocument(html?: string): Document;
}
