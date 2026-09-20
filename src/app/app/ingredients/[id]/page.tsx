import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rows, number, readResult } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import { operationError } from '@/lib/operation-error';
import IngredientForm from '@/components/ingredient-form';
import { PackForm } from '@/components/master-forms';
import { PageHeader } from '@/components/shell';
import loadIngredientStock from '@/lib/ingredient-stock';
import IngredientStock from '@/components/ingredient-stock';
import recipeText from '@/domain/recipe-text';

export default async function IngredientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, profile } = await requireAdminShell();
  const result = await db.from('ingredients').select('*').eq('id', id).maybeSingle();
  if (result.error) throw operationError('ingredient_load', 'Unable to load ingredient.', result.error);
  if (!result.data) notFound();
  const ingredient = rowSchemas.ingredients.parse(result.data);
  const details = await Promise.all([
    rows(db, 'allergens', rowSchemas.allergens),
    db.from('ingredient_translations').select('display_name').eq('ingredient_id', id).maybeSingle(),
    db.from('ingredient_allergens').select('allergen_id').eq('ingredient_id', id),
    rows(db, 'suppliers', rowSchemas.suppliers),
    rows(db, 'supplier_items', rowSchemas.supplier_items),
    db
      .from('reference_options')
      .select('code,label_en,label_es')
      .eq('list_code', 'ingredient_category')
      .eq('active', true)
      .order('sort_order'),
    hasPermission(db, 'master_data.write'),
    loadIngredientStock(db),
  ]);
  const [
    allergens, translations, links, suppliers, allPacks, categoryResult, canWrite, stock,
  ] = details;
  const translation = readResult(
    translations,
    z.object({ display_name: z.string() }).nullable(),
    'ingredient_translation',
  );
  const selected = readResult(
    links,
    z.array(z.object({ allergen_id: z.uuid() })),
    'ingredient_allergens',
  ).map((x) => x.allergen_id);
  const categories = readResult(
    categoryResult,
    rowSchemas.reference_options.pick({ code: true, label_en: true, label_es: true }).array(),
    'ingredient_categories',
  );
  const packs = allPacks.filter((p) => p.ingredient_id === id);
  return (
    <>
      <Link href="/app/ingredients" className="back-link">
        ← Ingredients
      </Link>
      <PageHeader
        eyebrow={ingredient.category}
        title={ingredient.name}
        description={`Base unit: ${ingredient.default_uom} · ${ingredient.active ? 'Active' : 'Inactive'}`}
      />
      <section className="panel">
        <h2>{recipeText(profile.preferred_locale, 'On hand')}</h2>
        {stock ? (
          <IngredientStock
            quantity={stock[id]}
            unit={ingredient.default_uom}
            locale={profile.preferred_locale}
          />
        ) : <p>{recipeText(profile.preferred_locale, 'Inventory details unavailable with your access')}</p>}
      </section>
      <section className="panel">
        <h2>Ingredient details</h2>
        {canWrite ? (
          <IngredientForm
            ingredient={ingredient}
            spanish={translation?.display_name}
            allergens={allergens}
            selected={selected}
            categories={categories}
            locale={profile.preferred_locale}
          />
        ) : (
          <dl>
            <dt>Spanish name</dt>
            <dd>{translation?.display_name ?? 'Needs review'}</dd>
            <dt>Description</dt>
            <dd>{ingredient.description || 'Not provided'}</dd>
            <dt>Storage</dt>
            <dd>{ingredient.storage_notes || 'Not provided'}</dd>
            <dt>Allergens</dt>
            <dd>
              {allergens
                .filter((a) => selected.includes(a.id))
                .map((a) => a.name)
                .join(', ') || 'None recorded; verify before use'}
            </dd>
          </dl>
        )}
      </section>
      <section className="panel">
        <h2>Supplier packs</h2>
        <p>Keep purchasing quantities explicit. Only one active pack can be preferred.</p>
        {!packs.length && <p className="empty">No supplier packs yet.</p>}
        {packs.map((pack) => (
          <details key={pack.id}>
            <summary>
              {suppliers.find((s) => s.id === pack.supplier_id)?.name}
              {' '}
              ·
              {' '}
              {number(Number(pack.pack_quantity))}
              {' '}
              {pack.pack_quantity_uom}
              {' '}
              /
              {' '}
              {pack.purchase_uom}
              {' '}
              {pack.is_preferred ? '· Preferred' : ''}
              {' '}
              {!pack.active ? '· Inactive' : ''}
            </summary>
            {canWrite ? (
              <PackForm
                pack={pack}
                ingredientId={id}
                unit={ingredient.default_uom}
                suppliers={suppliers}
              />
            ) : (
              <p>{pack.notes || 'No notes'}</p>
            )}
          </details>
        ))}
        {canWrite
          && (suppliers.length ? (
            <details>
              <summary>+ Add supplier pack</summary>
              <PackForm ingredientId={id} unit={ingredient.default_uom} suppliers={suppliers} />
            </details>
          ) : (
            <Link href="/app/suppliers">Add a supplier to define purchasing packs →</Link>
          ))}
      </section>
    </>
  );
}
