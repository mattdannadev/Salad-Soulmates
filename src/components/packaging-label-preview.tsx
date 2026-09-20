export default function PackagingLabelPreview({
  displayName, ingredientStatement, width, height, locale,
}: {
  displayName: string;
  ingredientStatement: string;
  width: number;
  height: number;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const invalidDimensionsLabel = es ? 'Revise las dimensiones.' : 'Check label dimensions.';
  const validDimensions = Number.isFinite(width) && Number.isFinite(height)
    && width >= 1 && width <= 12 && height >= 1 && height <= 12;
  return (
    <figure className="packaging-preview">
      <figcaption>{es ? 'Vista previa de la etiqueta' : 'Label preview'}</figcaption>
      <div className="packaging-label" style={{ aspectRatio: validDimensions ? `${width} / ${height}` : '3 / 5' }}>
        <span className="packaging-proof">{es ? 'MUESTRA · NO USAR EN PRODUCTO' : 'SAMPLE · NOT FOR PRODUCT USE'}</span>
        <strong>{displayName || (es ? 'Nombre del producto' : 'Product name')}</strong>
        <p>{ingredientStatement || (es ? 'Agregue la declaración de ingredientes aprobada.' : 'Add the approved ingredient statement.')}</p>
        <b>{es ? 'Lote: MUESTRA' : 'Lot: SAMPLE'}</b>
      </div>
      <p>{validDimensions ? `${width} × ${height} ${es ? 'pulgadas' : 'inches'}` : invalidDimensionsLabel}</p>
      <small>{es ? 'Vista ilustrativa; verifique el ajuste con la impresora antes de imprimir etiquetas de producción.' : 'Layout illustration; verify fit with the printer before printing production labels.'}</small>
    </figure>
  );
}
