import type { PackagingVersion } from '@/domain/packaging';
import PackagingForm from './packaging-form';
import type { PackagingProduct } from './packaging-form';
import PackagingLabelPreview from './packaging-label-preview';

export default function PackagingSetup({
  product, versions, canWrite, locale,
}: {
  product: PackagingProduct;
  versions: PackagingVersion[];
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const statusLabel = (status: string) => {
    if (status === 'Approved') return es ? 'Aprobada' : 'Approved';
    return es ? 'Borrador' : 'Draft';
  };
  const noApprovalLabel = es ? 'Sin versión aprobada. Se conservan los valores actuales del producto.' : 'No approved version. Current product defaults remain in use.';
  const ordered = [...versions].sort((left, right) => right.version - left.version);
  const latest = ordered[0] ?? null;
  const approved = ordered.find((version) => version.status === 'Approved');
  return (
    <details className="packaging-setup">
      <summary>{`${es ? 'Configuración de empaque y etiqueta' : 'Packaging & label setup'} · ${product.name}`}</summary>
      <p>{es ? 'Configure el empaque y el texto de la etiqueta. Los pedidos guardados conservan sus condiciones. El registro de bolsas llenadas estará disponible después de producción y transferencias a tanques.' : 'Set packaging and label content. Saved orders retain their terms. Recording filled bags will follow production completion and tank transfers.'}</p>
      <p className="packaging-current">
        {approved ? `${es ? 'Versión aprobada' : 'Approved version'} ${approved.version} · ${approved.bag_size_gallons} gal × ${approved.bags_per_case} · ${approved.label_width_inches} × ${approved.label_height_inches} in` : noApprovalLabel}
      </p>
      {latest && <p className="packaging-latest">{`${es ? 'Última versión guardada' : 'Latest saved version'}: ${latest.version} · ${statusLabel(latest.status)}`}</p>}
      {canWrite && (
        <PackagingForm
          key={latest?.id ?? product.id}
          product={product}
          latest={latest}
          locale={locale}
        />
      )}
      {!canWrite && !versions.length && <p>{es ? 'Aún no hay versiones guardadas.' : 'No saved versions yet.'}</p>}
      {ordered.length > 0 && (
        <details>
          <summary>{es ? 'Historial de versiones' : 'Version history'}</summary>
          {ordered.map((version) => (
            <details key={version.id}>
              <summary>{`${es ? 'Versión' : 'Version'} ${version.version} · ${statusLabel(version.status)}`}</summary>
              <p>{`${version.bag_size_gallons} gal × ${version.bags_per_case} · ${es ? 'Una etiqueta por bolsa' : 'One label per bag'}`}</p>
              <p>{`${es ? 'Guardada' : 'Saved'}: ${version.created_at} · ${version.template_key}`}</p>
              {version.approved_at && <p>{`${es ? 'Aprobada' : 'Approved'}: ${version.approved_at}`}</p>}
              <PackagingLabelPreview
                displayName={version.display_name}
                ingredientStatement={version.ingredient_statement}
                width={version.label_width_inches}
                height={version.label_height_inches}
                locale={locale}
              />
            </details>
          ))}
        </details>
      )}
    </details>
  );
}
