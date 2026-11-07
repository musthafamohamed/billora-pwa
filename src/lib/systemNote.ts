/**
 * System-note descriptions: instructional text that belongs on the
 * Products screen, never inside an invoice. Products seeded with a
 * dynamic price carry notes like "Price is dynamic — enter the price
 * on each invoice." and older seeds carried "Selling price not
 * supplied — set the price in Products before invoicing." If such a
 * description is copied into a line item it prints on the invoice PDF
 * next to the product name, which is not what the operator wants.
 * Genuine user-entered descriptions never match these phrases and
 * are left alone.
 */
export function isSystemNote(description: string | undefined): boolean {
  const d = (description ?? '').toLowerCase();
  return d.includes('selling price not supplied') || d.includes('price is dynamic');
}
