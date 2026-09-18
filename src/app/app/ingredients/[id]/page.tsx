import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rows, number } from '@/lib/data';
import type { Ingredient, Supplier, SupplierItem } from '@/domain/master-data';
import { IngredientForm } from '@/components/ingredient-form';
import { PackForm } from '@/components/master-forms';
import { PageHeader } from '@/components/shell';
export default async function IngredientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, profile } = await requireAdminShell();
  const result = await db.from('ingredients').select('*').eq('id', id).maybeSingle();
  if (result.error) throw new Error('Unable to load ingredient.');
  if (!result.data) notFound();
  const ingredient = result.data as Ingredient;
  const [allergens, translations, links, suppliers, allPacks] = await Promise.all([
    rows<{ id: string; name: string }>(db, 'allergens'),
    db.from('ingredient_translations').select('display_name').eq('ingredient_id', id).maybeSingle(),
    db.from('ingredient_allergens').select('allergen_id').eq('ingredient_id', id),
    rows<Supplier>(db, 'suppliers'),
    rows<SupplierItem>(db, 'supplier_items'),
  ]);
  if (translations.error || links.error) throw new Error('Unable to load ingredient details.');
  const selected = links.data.map((x) => x.allergen_id);
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
        <h2>Ingredient details</h2>
        {profile.role === 'admin' ? (
          <IngredientForm
            ingredient={ingredient}
            spanish={translations.data?.display_name}
            allergens={allergens}
            selected={selected}
          />
        ) : (
          <dl>
            <dt>Spanish name</dt>
            <dd>{translations.data?.display_name ?? 'Needs review'}</dd>
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
              {suppliers.find((s) => s.id === pack.supplier_id)?.name} ·{' '}
              {number(Number(pack.pack_quantity))} {pack.pack_quantity_uom} / {pack.purchase_uom}{' '}
              {pack.is_preferred ? '· Preferred' : ''} {!pack.active ? '· Inactive' : ''}
            </summary>
            {profile.role === 'admin' ? (
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
        {profile.role === 'admin' &&
          (suppliers.length ? (
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
