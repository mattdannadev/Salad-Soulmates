import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import { PageHeader } from '@/components/shell';
import MaterialPlanForm from '@/components/material-plan-form';
import { CancelMaterialPlan } from '@/components/purchase-status-form';
import { formatDate, formatNumber } from '@/domain/format';

export default async function Materials({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  if (plan && !z.uuid().safeParse(plan).success) notFound();
  const workspace = await loadPurchasingWorkspace(plan);
  const {
    selected, requirements, canWrite, locale,
  } = workspace;
  if (plan && !selected) notFound();
  const es = locale === 'es';
  const choices = workspace.versions
    .filter(
      (version) => version.status === 'Released' && version.target_yield_gallons === 40,
    )
    .flatMap((version) => {
      const recipe = workspace.recipes.find(
        (candidate) => candidate.id === version.recipe_id,
      );
      const product = workspace.products.find(
        (candidate) => candidate.id === recipe?.product_id,
      );
      return product?.active && product.standard_batch_gallons === 40
        ? [
          {
            id: version.id,
            label: `${product.name} · v${version.version_number}`,
          },
        ]
        : [];
    });
  return (
    <>
      <PageHeader
        eyebrow={
          es ? 'PREPARAR LA PRÓXIMA PRODUCCIÓN' : 'PREPARE THE NEXT PRODUCTION RUN'
        }
        title={es ? 'Requisitos de materiales' : 'Materials requirements'}
        description={
          es
            ? 'Recetas publicadas, existencias y compras entrantes en una hoja explicable.'
            : 'Released recipes, stock and incoming purchases in one explainable worksheet.'
        }
      />
      <section className="panel">
        <h2>{es ? 'Hojas guardadas' : 'Saved worksheets'}</h2>
        {!workspace.plans.length && (
          <p className="empty">
            {es ? 'Crea la primera hoja abajo.' : 'Create your first worksheet below.'}
          </p>
        )}
        <div className="worksheet-links">
          {workspace.plans
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((saved) => (
              <Link
                key={saved.id}
                className="worksheet-link"
                href={`/app/materials?plan=${saved.id}`}
                aria-current={saved.id === selected?.id ? 'page' : undefined}
              >
                <strong>{saved.name}</strong>
                <span>
                  {formatDate(saved.needed_on)}
                  {' '}
                  ·
                  {saved.status}
                </span>
              </Link>
            ))}
        </div>
      </section>
      {selected && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{selected.name}</h2>
              <p>
                {es ? 'Necesario para' : 'Needed by'}
                {' '}
                {formatDate(selected.needed_on)}
                {' '}
                ·
                {' '}
                {selected.status}
              </p>
            </div>
            {selected.status === 'Active' && (
              <Link className="button" href={`/app/purchasing?plan=${selected.id}`}>
                {es ? 'Revisar compras' : 'Review purchasing'}
              </Link>
            )}
          </div>
          {selected.status === 'Cancelled' ? (
            <p>
              {es
                ? 'Compromisos liberados. El historial se conserva.'
                : 'Commitments released. The original requirements remain in history.'}
            </p>
          ) : (
            <p>
              {es
                ? 'El inventario no se consume al planificar. Solo se cuenta la entrada confirmada antes de la fecha indicada.'
                : 'Planning does not consume inventory. Only confirmed inbound due by the needed date counts.'}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                {es ? 'Requisitos por ingrediente' : 'Ingredient requirements'}
              </caption>
              <thead>
                <tr>
                  {(es
                    ? [
                      'Ingrediente',
                      'Requerido',
                      'Existencias',
                      'Otros compromisos',
                      'Entrada confirmada',
                      'Faltante',
                    ]
                    : [
                      'Ingredient',
                      'Required',
                      'Usable stock',
                      'Other commitments',
                      'Confirmed inbound',
                      'Shortage',
                    ]
                  ).map((heading) => (
                    <th key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.requirements.map((requirement) => {
                  const availability = requirements.find(
                    (row) => row.ingredient_id === requirement.ingredient_id,
                  );
                  return (
                    <tr key={requirement.ingredient_id}>
                      <th scope="row">
                        <Link href={`/app/ingredients/${requirement.ingredient_id}`}>
                          {requirement.ingredient_name}
                        </Link>
                        <small>
                          {' '}
                          {requirement.uom}
                        </small>
                      </th>
                      <td>{formatNumber(requirement.required)}</td>
                      {availability ? (
                        <>
                          <td>{formatNumber(availability.on_hand)}</td>
                          <td>{formatNumber(availability.other_commitments)}</td>
                          <td>{formatNumber(availability.confirmed_inbound)}</td>
                          <td>
                            <strong>{formatNumber(availability.shortage)}</strong>
                          </td>
                        </>
                      ) : (
                        <td colSpan={4}>—</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details>
            <summary>
              {es
                ? 'Cómo se calcularon las cantidades'
                : 'How these quantities were calculated'}
            </summary>
            {selected.requirements.map((requirement) => (
              <div key={requirement.ingredient_id}>
                <h3>{requirement.ingredient_name}</h3>
                <ul>
                  {requirement.contributions.map((contribution) => (
                    <li key={contribution.recipe_line_id}>
                      {contribution.product_name}
                      {' '}
                      v
                      {contribution.version_number}
                      :
                      {contribution.batch_count}
                      {' '}
                      ×
                      {formatNumber(contribution.per_batch)}
                      {' = '}
                      {formatNumber(contribution.quantity)}
                      {' '}
                      {requirement.uom}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
          {canWrite && selected.status === 'Active' && (
            <details>
              <summary>{es ? 'Cancelar hoja' : 'Cancel worksheet'}</summary>
              <CancelMaterialPlan id={selected.id} locale={locale} />
            </details>
          )}
        </section>
      )}
      {canWrite && (
        <section className="panel">
          <h2>{es ? 'Nueva hoja de requisitos' : 'New requirements worksheet'}</h2>
          <p>
            {es
              ? 'Guarda las versiones y cantidades de recetas. Para cambiar lotes, cancela la hoja y crea otra.'
              : 'Save the recipe versions and quantities used. To change batch counts, cancel the worksheet and create a replacement.'}
          </p>
          <MaterialPlanForm
            key={selected?.id ?? 'new'}
            choices={choices}
            locale={locale}
          />
        </section>
      )}
    </>
  );
}
