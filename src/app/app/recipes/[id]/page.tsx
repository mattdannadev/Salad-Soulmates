import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import { rowSchemas } from '@/domain/master-data';
import type { Ingredient } from '@/domain/master-data';
import {
  recipeRowSchema, recipeVersionRowSchema, recipeSectionRowSchema,
  recipeLineRowSchema, recipeQualityRuleRowSchema, selectRecipeVersion,
} from '@/domain/recipes';
import { formatDate, formatNumber } from '@/domain/format';
import { requireRecipeAccess } from '@/lib/recipe-catalog';
import { readResult, rows } from '@/lib/data';
import loadIngredientStock from '@/lib/ingredient-stock';
import IngredientStock from '@/components/ingredient-stock';

type RecipeLine = z.infer<typeof recipeLineRowSchema>;

function RecipeIngredientGroup({
  title, lines, ingredients, stock, locale,
}: {
  title: string;
  lines: RecipeLine[];
  ingredients: Ingredient[];
  stock: Record<string, number> | null;
  locale: 'en' | 'es';
}) {
  return (
    <section className="recipe-ingredient-group" aria-label={title}>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{recipeText(locale, 'Ingredient')}</th>
              <th>{recipeText(locale, 'Recipe measure')}</th>
              <th>{recipeText(locale, 'Base quantity')}</th>
              <th>{recipeText(locale, 'Instructions')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const ingredient = ingredients.find((item) => item.id === line.ingredient_id);
              return (
                <tr key={line.id}>
                  <td>
                    {ingredient ? (
                      <>
                        <Link href={`/app/ingredients/${ingredient.id}`}>{ingredient.name}</Link>
                        {stock && stock[ingredient.id] !== undefined ? (
                          <IngredientStock
                            quantity={stock[ingredient.id]}
                            unit={ingredient.default_uom}
                            locale={locale}
                          />
                        ) : (
                          <p className="inventory-status muted">
                            {recipeText(locale, stock ? 'Not in inventory' : 'Inventory unavailable')}
                          </p>
                        )}
                      </>
                    ) : recipeText(locale, 'Ingredient details unavailable with your access')}
                  </td>
                  <td>{line.display_measurement}</td>
                  <td>
                    {formatNumber(line.normalized_quantity)}
                    {' '}
                    {line.normalized_uom}
                  </td>
                  <td>{line.operator_note ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function RecipeDetails({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { db, profile } = await requireRecipeAccess();
  const locale = profile.preferred_locale;
  const route = z.object({ id: z.uuid() }).safeParse(await params);
  const query = z.object({ version: z.uuid().optional() }).safeParse(await searchParams);
  if (!route.success || !query.success) notFound();
  const recipe = readResult(
    await db.from('recipes').select('*').eq('id', route.data.id).maybeSingle(),
    recipeRowSchema.nullable(),
    'recipe_details',
  );
  if (!recipe) notFound();
  const versions = (await rows(db, 'recipe_versions', recipeVersionRowSchema))
    .filter((version) => version.recipe_id === recipe.id)
    .sort((left, right) => right.version_number - left.version_number);
  const version = selectRecipeVersion(recipe, versions, query.data.version);
  if (!version && query.data.version) notFound();
  const [allSections, allLines, allRules, ingredients, stock] = version ? await Promise.all([
    rows(db, 'recipe_sections', recipeSectionRowSchema),
    rows(db, 'recipe_lines', recipeLineRowSchema),
    rows(db, 'recipe_qc_rules', recipeQualityRuleRowSchema),
    rows(db, 'ingredients', rowSchemas.ingredients),
    loadIngredientStock(db),
  ]) : [[], [], [], [], null];
  const sections = allSections.filter((section) => section.recipe_version_id === version?.id)
    .sort((left, right) => left.sequence - right.sequence);
  const lines = allLines.filter((line) => line.recipe_version_id === version?.id);
  const rules = allRules.filter((rule) => rule.recipe_version_id === version?.id)
    .sort((left, right) => left.sequence - right.sequence);
  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'RECIPE DETAILS')}
        title={recipe.name}
        description={recipeText(locale, 'Recorded quantities and instructions for this recipe version.')}
        action={<Link className="button secondary" href="/app/recipes">{recipeText(locale, 'All recipes')}</Link>}
      />
      <section className="panel">
        <h2>{recipeText(locale, 'Version history')}</h2>
        <nav aria-label={recipeText(locale, 'Recipe versions')} className="recipe-version-links">
          {versions.map((item) => (
            <Link
              key={item.id}
              href={`/app/recipes/${recipe.id}?version=${item.id}`}
              aria-current={version?.id === item.id ? 'page' : undefined}
              className="badge"
            >
              v
              {item.version_number}
              {' '}
              ·
              {' '}
              {recipeText(locale, item.status)}
              {recipe.active_version_id === item.id ? ` · ${recipeText(locale, 'Active')}` : ''}
            </Link>
          ))}
        </nav>
        {version ? (
          <>
            <p>
              <strong>
                {formatNumber(version.target_yield_gallons)}
                {' '}
                gal
              </strong>
              {' '}
              {recipeText(locale, 'target batch yield')}
            </p>
            <p>{version.released_at ? `${recipeText(locale, 'Released')} ${formatDate(version.released_at)}` : recipeText(locale, 'Draft — not released for production.')}</p>
            <p>
              {recipeText(locale, 'Released versions are preserved. Recipe editing and new revisions are a later build step.')}
            </p>
          </>
        ) : <p>{recipeText(locale, 'No versions have been recorded for this recipe.')}</p>}
      </section>
      {sections.map((section) => {
        const sectionLines = lines.filter((line) => line.recipe_section_id === section.id)
          .sort((left, right) => left.sequence - right.sequence);
        const dryLines = sectionLines.filter((line) => (
          ingredients.find((ingredient) => ingredient.id === line.ingredient_id)?.category !== 'Liquid'
        ));
        const liquidLines = sectionLines.filter((line) => (
          ingredients.find((ingredient) => ingredient.id === line.ingredient_id)?.category === 'Liquid'
        ));
        return (
          <section className="panel" key={section.id}>
            <h2>{/^Worksheet block \d+$/i.test(section.name.trim()) ? recipeText(locale, 'Ingredients') : section.name}</h2>
            {dryLines.length ? (
              <RecipeIngredientGroup
                title={recipeText(locale, 'Dry ingredients')}
                lines={dryLines}
                ingredients={ingredients}
                stock={stock}
                locale={locale}
              />
            ) : null}
            {liquidLines.length ? (
              <RecipeIngredientGroup
                title={recipeText(locale, 'Liquid ingredients')}
                lines={liquidLines}
                ingredients={ingredients}
                stock={stock}
                locale={locale}
              />
            ) : null}
          </section>
        );
      })}
      {version && !sections.length && <section className="panel"><p>{recipeText(locale, 'No preparation sections recorded.')}</p></section>}
      <section className="panel">
        <h2>{recipeText(locale, 'Quality checks')}</h2>
        {rules.length ? rules.map((rule) => (
          <article key={rule.id}>
            <h3>{rule.name}</h3>
            <p>
              {formatNumber(rule.min_value)}
              –
              {formatNumber(rule.max_value)}
              {' '}
              {rule.uom}
            </p>
            <p>{rule.instructions}</p>
          </article>
        )) : <p>{recipeText(locale, 'No quality checks have been recorded for this version.')}</p>}
      </section>
    </>
  );
}
