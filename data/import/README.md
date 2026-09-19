# Ingredient import preparation

Export historical batch worksheet lines to CSV using `worksheet-export-template.csv`. Keep the ingredient wording and unit exactly as written in the source.

Run `npm run prepare:ingredients -- path/to/worksheet-export.csv`. The script groups repeated ingredient names, records every observed recipe and unit, and writes `ingredient-review.csv`. It deliberately leaves Spanish names and categories blank and marks every row `ready_to_load=false`. A person must resolve aliases, inconsistent units, and translations before a database load is generated or run.

The mockup screens are visual references and are not source data. No ingredient shown only in a mockup is imported.
