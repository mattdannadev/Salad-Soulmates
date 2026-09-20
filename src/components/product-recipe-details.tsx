import recipeText from '@/domain/recipe-text';
import { formatNumber } from '@/domain/format';
import type {
  Recipe, RecipeLine, RecipeSection, RecipeVersion,
} from '@/domain/recipes';
import type { Ingredient } from '@/domain/master-data';

/** Displays the immutable active formulation without turning the catalog into a recipe editor. */
export default function ProductRecipeDetails({
  recipe, version, sections, lines, ingredients, locale,
}: {
  recipe: Recipe;
  version: RecipeVersion;
  sections: RecipeSection[];
  lines: RecipeLine[];
  ingredients: Ingredient[];
  locale: 'en' | 'es';
}) {
  const activeSections = sections
    .filter((section) => section.recipe_version_id === version.id)
    .sort((left, right) => left.sequence - right.sequence);
  const activeLines = lines.filter((line) => line.recipe_version_id === version.id);

  return (
    <details className="product-recipe-details">
      <summary>
        {recipeText(locale, 'Active recipe details')}
        <span className="product-recipe-meta">
          {`${recipe.name} · v${version.version_number} · ${formatNumber(version.target_yield_gallons)} gal`}
        </span>
      </summary>
      <div className="product-recipe-content">
        {activeSections.length ? activeSections.map((section) => {
          const sectionLines = activeLines
            .filter((line) => line.recipe_section_id === section.id)
            .sort((left, right) => left.sequence - right.sequence);
          return (
            <section key={section.id} aria-label={section.name}>
              <h4>{/^Worksheet block \d+$/i.test(section.name.trim()) ? recipeText(locale, 'Ingredients') : section.name}</h4>
              {sectionLines.length ? (
                <ul>
                  {sectionLines.map((line) => {
                    const ingredient = ingredients.find((item) => item.id === line.ingredient_id);
                    return (
                      <li key={line.id}>
                        <span>{ingredient?.name ?? recipeText(locale, 'Ingredient details unavailable with your access')}</span>
                        <span>{line.display_measurement}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p>{recipeText(locale, 'No preparation sections recorded.')}</p>}
            </section>
          );
        }) : <p>{recipeText(locale, 'No preparation sections recorded.')}</p>}
      </div>
    </details>
  );
}
