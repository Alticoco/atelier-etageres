# Feuille de route

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé
Règle : une étape = un commit testable. On ne commence pas l'étape suivante tant que la précédente ne fonctionne pas.

## MVP (v1)

- [x] **Étape 0 — Socle** : projet Vite + React + TypeScript, lint, tests (Vitest), déploiement GitHub Pages via GitHub Actions, page « Hello » en ligne.
- [x] **Étape 1 — Modèle de données** : types (Plan, Montant, Tablette, Cale), création d'un plan depuis des paramètres, calcul des dimensions de chaque pièce. Tests unitaires sur les règles d'assemblage.
- [x] **Étape 2 — Vue de face** : rendu SVG du cadre, tablettes, cales, avec cotes. Zoom / déplacement de la vue.
- [x] **Étape 3 — Assistant de création** : formulaire (dimensions, nombre d'étages, épaisseurs).
- [x] **Étape 4 — Sélection et panneau de propriétés** : sélection simple et multiple, édition des cotes au clavier, unités mm/cm.
- [x] **Étape 5 — Glisser-déposer** : déplacer tablettes et cales, redimensionner le cadre, aimantation à pas réglable.
- [x] **Étape 6 — Propagation et outils** : option intelligente, « espacer également », ajout/suppression de pièces, contrôles de cohérence.
- [x] **Étape 7 — Annuler / rétablir**.
- [x] **Étape 8 — Vue de profil** (lecture seule).
- [x] **Étape 9 — Liste de découpe** : regroupement, repères, option trait de scie.
- [x] **Étape 10 — Sauvegarde** : bibliothèque IndexedDB, export/import `.etagere.json`.
- [x] **Étape 11 — Export PDF** : plan d'architecte A4 paysage, note fixation murale, JSON embarqué, ré-import du PDF.
- [x] **Étape 12 — Finitions** : design, raccourcis clavier, README du dépôt, vérification des critères de « terminé ».

### Critères de « terminé » du MVP (voir `docs/SPEC.md` §7)

- [ ] **1. Recréer une de mes mangathèques en moins de 10 minutes** — à valider par Alexis avec sa vraie étagère : le parcours est prêt (assistant, puis une cale par étage), mais seul un essai réel peut chronométrer.
- [x] **2. La liste de découpe correspond à ce que j'aurais calculé à la main** — quatre cas calculés à la main (chaque calcul est écrit en commentaire) dans `src/acceptance.test.ts` : cadre entre les montants, tablettes posées dessus, montants plus épais, trait de scie.
- [x] **3. Le PDF s'imprime lisiblement en A4 paysage** — vérifié par tests (page 297 × 210 mm, marge de 5 mm, aucun texte sous 6 pt, cotes et tableau à 7 pt ou plus, traits >= 0,1 mm, 3 tailles d'étagère) et par le rendu de la page avec un lecteur indépendant. **Reste à imprimer une fois sur papier** pendant la période de test.
- [x] **4. Un PDF exporté puis ré-importé redonne le même plan** — testé (et vérifié dans le navigateur avec la vraie base de données).
- [x] **5. Le site est en ligne sur GitHub Pages** — <https://alticoco.github.io/atelier-etageres/> : déploiement de l'étape 12 vérifié (automatisation réussie, page et fichiers en HTTP 200, fichiers publiés identiques à ceux du build local).

## Période de test

- [ ] Utiliser l'app pour concevoir l'étagère à épices.
- [ ] Imprimer le plan PDF sur une vraie imprimante A4 : vérifier marges et lisibilité des cotes (critère 3).
- [ ] Chronométrer la recréation d'une mangathèque existante (critère 1).
- [ ] Noter ici les bugs et envies apparus pendant le test.

## V2

Ordre choisi avec Alexis (5 octobre 2026) : le modèle sans cadre d'abord, car les arrondis et le profil éditable s'appuient dessus.

- [x] **Étape 13 — Modèle sans cadre** : planches apparentes, tablettes continues avec débords réglables à gauche et à droite, montants coupés à la hauteur de chaque étage (un à gauche et un à droite), supprimables un par un ; choix du modèle à la création (assistant), largeur hors-tout ; liste de découpe, vue de face, profil et PDF.
- [x] **Étape 14 — Arrondis** des arêtes et des coins (plan + PDF) : deux rayons par pièce (coins vus de face, arêtes vues de profil), mention dans la liste de découpe.
- [x] **Étape 15 — Vue de profil éditable** : choisir une pièce au clic, changer la profondeur en tirant son bord avant, monter / descendre les tablettes ; étages de profondeurs différentes.
- [x] **Étape 16 — Onglets de plans + écran partagé** : plusieurs plans ouverts en onglets (historique et sélection propres à chacun), deux plans côte à côte avec une vue au choix dans chaque volet.
- [~] **Étape 17 — Déplacer les cales entre étages et segmenter les planches** (demande d'Alexis, 10 octobre 2026) :
  - [x] 17a — Glisser une cale d'un étage à l'autre : elle prend la hauteur de l'étage et s'aimante contre les montants et les cales voisines.
  - [ ] 17b — « Couper ici » : segmenter une planche (montant ou tablette) pour avoir des hauteurs / longueurs différentes (ex. un côté à 1 m, l'autre à 70 cm ; un étage plus court). Conception à valider avec l'auteur avant de coder.
- [x] **Étape 17c — Simulation de rangement** (idée de la spec « plus tard », demandée par Alexis le 10 octobre 2026) : poser des mangas, livres, grands livres, bocaux d'épices dans un étage, avec capacité.
- [x] **Étape 17e — Objets un par un et cotes cliquables** (demande d'Alexis, 10 octobre 2026) : cliquer, supprimer, déplacer un objet de simulation ; espace réglable entre les objets ; cliquer une cote du dessin pour la modifier.
- [ ] **Étape 17f — Modes de construction : encoches et bouts de tablettes** (demande d'Alexis) : montant « vissé » d'un côté, « à encoches » de l'autre pour que les tablettes le traversent et dépassent ; bout qui dépasse arrondi ou coupé en biais (angle au choix), des deux côtés. Conception à valider avec l'auteur.
- [~] **Étape 18 — Supports (planches de soutien à part)** (demande d'Alexis, 10 octobre 2026) :
  - [x] 18a — Supports sous et autour de l'étagère : largeur, hauteur, profondeur, position, recul depuis le mur ; réglage au panneau et en tirant dans les vues de face, de profil et de dessous (nouvelle) ; liste de découpe à part.
  - [ ] 18b — Supports dans le PDF ; aimantation sur d'autres supports ; copie / symétrie d'un support.
- [ ] **Étape 19 — Panneau de droite repensé, nombre d'étages modifiable, menu au clic sur le dessin** (à concevoir avec Alexis).
- [ ] **Étape 20 — Optimisation des découpes** (à confirmer : peut-être inutile).


## V3

- [ ] Vue 3D (rotation, zoom)
- [ ] Portes / coffrets
- [ ] Tiroirs

## Boîte à idées (plus tard)

- Simulation d'objets rangés : objets de dimensions personnalisées, rangées couchées / empilées, vue de profil et PDF
- Alerte de flexion
- Estimation du prix
- Version téléphone
- Sélection par rectangle (la spec la prévoit en complément de Ctrl/Maj + clic) : en conflit avec le glisser pour déplacer la vue ; à trancher (ex. Maj + glisser) avant l étape 5.
- Conversion d'une étagère existante d'un modèle à l'autre (avec cadre ↔ sans cadre).
- Cotes de débord et largeur du corps sur le dessin (modèle sans cadre).
- Synthèse des longueurs totales à acheter par section de planche (largeur × épaisseur), à côté de la liste de découpe.
- Repères A, B, C aussi sur la vue de profil (écran et PDF) ; export PDF directement depuis la liste « Mes étagères ».
- Impression : vérifier le rendu sur une vraie imprimante A4 (marges, lisibilité des cotes à 7 pt) pendant la période de test.
- Arrondir seulement certains coins d une pièce ; rayon par défaut dans l assistant.
- Retrouver les onglets ouverts au rechargement de la page ; copier une pièce d'un plan à l'autre en écran partagé ; synchroniser le zoom des deux volets.
- Choisir une pièce du profil dans une liste cliquable (en plus du clic sur la plus petite pièce).
- Profil : tirer plusieurs pièces d'un même écart (en gardant leurs différences) plutôt qu'à la même profondeur.
