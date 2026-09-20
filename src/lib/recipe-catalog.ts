import 'server-only';
import { redirect } from 'next/navigation';
import { productRowSchema, recipeRowSchema, recipeVersionRowSchema } from '@/domain/recipes';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows } from './data';

/** Use the signed-in client's RLS and the same permission as product/recipe navigation. */
export async function requireRecipeAccess() {
  const context = await requireAdminShell();
  if (!(await hasPermission(context.db, 'products.read'))) redirect('/app');
  return context;
}

export async function loadRecipeCatalog() {
  const { db, profile } = await requireRecipeAccess();
  const [products, recipes, versions] = await Promise.all([
    rows(db, 'products', productRowSchema),
    rows(db, 'recipes', recipeRowSchema),
    rows(db, 'recipe_versions', recipeVersionRowSchema),
  ]);
  return {
    db, products, recipes, versions, locale: profile.preferred_locale,
  };
}
