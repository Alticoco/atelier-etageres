# Feuille de route

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé
Règle : une étape = un commit testable. On ne commence pas l'étape suivante tant que la précédente ne fonctionne pas.

## MVP (v1)

- [x] **Étape 0 — Socle** : projet Vite + React + TypeScript, lint, tests (Vitest), déploiement GitHub Pages via GitHub Actions, page « Hello » en ligne.
- [x] **Étape 1 — Modèle de données** : types (Plan, Montant, Tablette, Cale), création d'un plan depuis des paramètres, calcul des dimensions de chaque pièce. Tests unitaires sur les règles d'assemblage.
- [x] **Étape 2 — Vue de face** : rendu SVG du cadre, tablettes, cales, avec cotes. Zoom / déplacement de la vue.
- [ ] **Étape 3 — Assistant de création** : formulaire (dimensions, nombre d'étages, épaisseurs).
- [ ] **Étape 4 — Sélection et panneau de propriétés** : sélection simple et multiple, édition des cotes au clavier, unités mm/cm.
- [ ] **Étape 5 — Glisser-déposer** : déplacer tablettes et cales, redimensionner le cadre, aimantation à pas réglable.
- [ ] **Étape 6 — Propagation et outils** : option intelligente, « espacer également », ajout/suppression de pièces, contrôles de cohérence.
- [ ] **Étape 7 — Annuler / rétablir**.
- [ ] **Étape 8 — Vue de profil** (lecture seule).
- [ ] **Étape 9 — Liste de découpe** : regroupement, repères, option trait de scie.
- [x] **Étape 10 — Sauvegarde** : bibliothèque IndexedDB, export/import `.etagere.json`.
- [x] **Étape 11 — Export PDF** : plan d'architecte A4 paysage, note fixation murale, JSON embarqué, ré-import du PDF.
- [x] **Étape 12 — Finitions** : design, raccourcis clavier, README du dépôt, vérification des critères de « terminé ».

## Période de test

- [ ] Utiliser l'app pour concevoir l'étagère à épices.
- [ ] Noter ici les bugs et envies apparus pendant le test.

## V2

- [ ] Modèle sans cadre (planches apparentes, débords réglables)
- [ ] Arrondis des arêtes et des coins (plan + PDF)
- [ ] Vue de profil éditable
- [ ] Onglets de plans + écran partagé
- [ ] Optimisation des découpes (à confirmer)

## V3

- [ ] Vue 3D (rotation, zoom)
- [ ] Portes / coffrets
- [ ] Tiroirs

## Boîte à idées (plus tard)

- Simulation d'objets rangés et estimation de capacité
- Alerte de flexion
- Estimation du prix
- Version téléphone
