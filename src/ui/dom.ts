/**
 * Tiny helpers for building the page. Everything goes in as text, never as HTML,
 * so a label like "<img onerror=...>" shows up as those exact characters.
 */

type Child = Node | string | null | false | undefined;
type Attrs = Record<string, string | boolean | number | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing an element with id="${id}"`);
  return node as T;
}

/** Replaces a node's children only when the described content changed, so screen readers do not repeat it. */
export function setIfChanged(node: HTMLElement, signature: string, build: () => Node[]): void {
  if (node.dataset['sig'] === signature) return;
  node.dataset['sig'] = signature;
  node.replaceChildren(...build());
}

export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function link(href: string, text: string): HTMLAnchorElement {
  return el('a', { href, rel: 'noopener', target: '_blank' }, text);
}
