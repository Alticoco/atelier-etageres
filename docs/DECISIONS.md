# Journal des décisions

Chaque décision : date, choix, raison. On ajoute, on ne réécrit pas (si une décision change, on en ajoute une nouvelle qui la remplace).

## 2026-10-04

- **Site web statique plutôt que logiciel installé.** Usage occasionnel ; plus simple à maintenir et à porter sur téléphone plus tard.
- **Public sur GitHub Pages, code open source.** Aucune donnée sensible ; enrichit le portfolio GitHub.
- **Stack : Vite + React + TypeScript.** Écosystème standard, bien outillé ; TypeScript sécurise les calculs de dimensions.
- **Rendu 2D en SVG.** Précision des cotes, export PDF vectoriel simple, interaction souris native.
- **3D plus tard avec Three.js (react-three-fiber)**, en lisant le même modèle de données que la 2D.
- **Unité interne : millimètres entiers.** Évite les erreurs d'arrondi ; l'affichage cm n'est qu'une conversion.
- **Modèle « cadre » d'abord, tablettes entre les montants par défaut.** Correspond aux mangathèques déjà réalisées. Modèle sans cadre en V2.
- **Cales = hauteur d'étage − jeu (défaut 1 mm).** Elles doivent pouvoir glisser, puis se bloquer sous la charge.
- **Liste de découpe simple, pas d'optimisation.** L'utilisateur choisit lui-même les planches en magasin ; l'optimisation n'est peut-être jamais nécessaire.
- **Sauvegarde locale (IndexedDB) + export fichier.** Pas de serveur ; l'export protège contre la perte si le navigateur est vidé.
- **Le PDF embarque le JSON du plan.** Un PDF exporté peut être ré-importé et redevient éditable.
- **Suivi d'avancement : `docs/ROADMAP.md` dans le dépôt + page Notion « Atelier Étagères ».**

## 2026-10-04 (étape 0)

- **Lint avec oxlint** (fourni par le modèle Vite actuel) plutôt qu'ESLint. Rapide, zéro configuration ; à réévaluer si des règles manquent.
- **TypeScript en mode `strict`** activé explicitement (le modèle Vite ne l'activait pas).
- **Vitest** pour les tests, environnement `node` : la logique de `src/model/` ne dépend pas du navigateur.
- **`base: '/atelier-etageres/'`** dans Vite : le site est servi dans un sous-dossier sur GitHub Pages.
- **Déploiement via GitHub Actions** (`.github/workflows/deploy.yml`) : lint + tests + build avant publication ; un test en échec bloque la mise en ligne.

## 2026-10-04 (étape 1)

- **Repère du modèle** : x depuis le bord gauche extérieur, y depuis le dessous du cadre (vers le haut). Une tablette est positionnée par la hauteur de sa face inférieure.
- **Une cale est rattachée à la tablette située sous son étage** (`shelfBelowId`), pas à un numéro d étage : elle reste liée au bon étage si on ajoute ou supprime des tablettes.
- **Répartition des étages** : si la hauteur libre ne se divise pas exactement en mm entiers, les mm restants vont un par un aux étages du bas. La hauteur totale est toujours exacte.
- **`createPlan` lève une erreur** (RangeError) pour des paramètres invalides ; les contrôles de cohérence d un plan modifié sont à l étape 6.
- **Plan créé sans cale** ; l ajout de cales vient avec les outils (étape 6). Cales et tablettes : profondeur et épaisseur propres à chaque pièce.
- **Pièces calculées, jamais stockées** : `computePieces(plan)` recalcule les dimensions à la demande, pour éviter toute incohérence.
