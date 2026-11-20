# Atelier Étagères

Concevez vos étagères en bois massif dans le navigateur : dessinez-les, ajustez leurs dimensions à la souris ou au clavier, puis obtenez la **liste des planches à faire découper** et un **plan PDF** à emporter en magasin.

**Essayer en ligne : <https://alticoco.github.io/atelier-etageres/>**

![L'éditeur : vue de face cotée et panneau de propriétés](docs/images/application.jpg)

## Ce que fait l'application

- **Assistant de création** : largeur, hauteur, profondeur, nombre d'étages, épaisseurs du bois. Aperçu en direct pendant la saisie.
- **Deux modèles de construction** : **avec cadre** (deux montants pleine hauteur, tablettes entre eux) ou **sans cadre** (planches apparentes : tablettes continues avec un débord réglable à gauche et à droite, montants coupés à la hauteur de chaque étage et supprimables un par un).
- **Vue de face** et **vue de profil** cotées, avec zoom et déplacement. Le profil est éditable : on y change la profondeur de chaque pièce (étages de profondeurs différentes) et on y déplace les tablettes.
- **Édition à la souris** : déplacer les tablettes et les cales, redimensionner le cadre par ses bords, avec aimantation à un pas réglable (1 mm, 5 mm, 1 cm, 5 cm ; `Alt` pour s'en passer).
- **Édition au clavier** : saisie de toute cote dans un panneau, flèches pour déplacer une pièce, sélection multiple pour appliquer une même épaisseur à plusieurs pièces.
- **Propagation « intelligente »** : changer la largeur ou la hauteur garde les cales et les tablettes à leur position proportionnelle (désactivable).
- **Contrôles de cohérence** : pas de chevauchement, pas de cale plus haute que son étage, des messages clairs quand une modification est refusée.
- **Arrondis** : deux rayons par pièce, un pour les coins (vue de face) et un pour les arêtes (vue de profil), limités à la moitié de la plus petite dimension visible. Dessinés sur le plan et sur le PDF, et indiqués dans la liste de découpe.
- **Vue de dessous et vue 3D** (rotation, zoom) : mur plein, transparent ou masqué, vues prédéfinies.
- **Encoches** (modèle avec cadre) : par côté, montant vissé ou à encoches (mi-bois, les tablettes traversent et dépassent) ; bout de tablette droit, arrondi ou coupé en biais.
- **Portes et tiroirs** (modèle avec cadre) : par étage, ouvert, une porte, deux portes ou un tiroir ; visibles en face, en 3D et dans le PDF, avec une liste de découpe à part.
- **Supports** : planches de soutien à part (sous et autour de l'étagère), réglables dans les vues de face, de profil et de dessous, avec liste de découpe à part et option dans le PDF.
- **Couleurs d'affichage** par catégorie et par pièce, en 2D et en 3D.
- **Onglets et écran partagé** : plusieurs plans ouverts, chacun avec son historique ; deux plans côte à côte.
- **Simulation de rangement** : poser des mangas, livres, bocaux d'épices dans un étage, avec capacité. On peut **créer ses propres objets** (nom, dimensions, boîte ou cylindre, couleur), les ranger debout, couchés ou de face, les empiler, et **ajuster la hauteur d'un étage à ses objets**. Les objets sont visibles en face, en profil et en 3D ; dans le PDF, c'est une option.
- **Synthèse d'achat et optimisation des découpes** : dans la vue « Découpe », le nombre de planches du commerce à acheter par section (largeur × épaisseur) et un schéma de découpe de chaque planche ; longueur des planches réglable (2 400 mm par défaut).
- **Modèles de départ** dans l'assistant : mangathèque, étagère à épices, bibliothèque, étagère murale sans cadre, meuble bas. Un clic remplit le formulaire, que l'on ajuste ensuite.
- **Copier, coller, dupliquer, symétrie, répartir** : sur les cales, supports et objets (aussi d'un onglet à l'autre) ; « Répartir N cales » dans un étage ; les flèches agissent sur toute la sélection.
- **Menu du clic droit** sur la vue de face : couper un montant, ajouter, décaler ou supprimer une cale ou une tablette, dupliquer un support, retirer un objet, répartir des cales.
- **Annuler / rétablir** (`Ctrl+Z`, `Ctrl+Y`), sans limite pendant la session.
- **Liste de découpe** : pièces regroupées par dimensions identiques, avec quantités et repères A, B, C… reportés sur le plan ; option « trait de scie » pour estimer la perte de bois.
- **Plan PDF** en A4 paysage, dessin vectoriel : vue de face et de profil cotées, liste de découpe, notes, cartouche. Options : « fixation murale », supports, objets rangés.
- **Sauvegarde** automatique dans le navigateur (bibliothèque d'étagères : ouvrir, renommer, dupliquer, supprimer), export et import d'un fichier `.etagere.json`.
- **Un PDF exporté peut être ré-importé** : le plan éditable est joint au PDF.
- Unités au choix : millimètres ou centimètres.

## Raccourcis clavier principaux

La liste complète est dans l'application (touche `?`).

| Touches | Action |
|---|---|
| `Ctrl+Z`, `Ctrl+Y` | Annuler, rétablir |
| `Ctrl+C`, `Ctrl+V`, `Ctrl+D` | Copier, coller, dupliquer la sélection (cales, supports, objets) |
| `Ctrl+A`, `Échap` | Tout sélectionner, désélectionner |
| `Suppr` | Supprimer la sélection |
| Flèches, `Maj` + flèche | Déplacer la sélection d'un pas d'aimantation, d'un millimètre |
| `Ctrl` ou `Maj` + clic | Ajouter ou retirer une pièce de la sélection |
| `Alt` + glisser | Déplacer sans aimantation |
| `1` `2` `3` `4` `5` | Vue de face, de profil, liste de découpe, de dessous, 3D |
| `Ctrl+S` | Enregistrer maintenant (c'est déjà automatique) |

### Exemple de plan PDF

![Plan PDF exporté : vues de face et de profil, liste de découpe, cartouche](docs/images/plan-pdf-exemple.png)

## Vos données restent chez vous

Aucune donnée n'est envoyée nulle part : pas de serveur, pas de compte, pas de statistiques. Les étagères sont enregistrées dans le stockage du navigateur (IndexedDB), propre à chaque navigateur et à chaque adresse. Pour les garder ou les changer d'ordinateur, utilisez **Exporter** (fichier `.etagere.json` ou PDF).

> Si vous videz les données du site dans votre navigateur, les étagères enregistrées disparaissent : exportez de temps en temps un fichier de secours.

## Lancer le projet en local

Il faut [Node.js](https://nodejs.org/) (version 20.19 ou plus récente ; le projet est développé avec Node 24).

```bash
npm install
npm run dev      # serveur local, avec rechargement automatique
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur local de développement |
| `npm test` | Lance tous les tests (Vitest) |
| `npm run lint` | Vérifie le code (oxlint) |
| `npm run build` | Construit le site dans `dist/` |
| `npm run preview` | Sert le site construit |

Le site est déployé automatiquement sur GitHub Pages à chaque envoi sur `main` (GitHub Actions : lint, tests et build doivent passer).

## Comment c'est construit

Vite + React + TypeScript (mode strict), tests avec Vitest. Choix techniques principaux :

- **Millimètres entiers partout** dans le modèle : pas d'erreur d'arrondi. Les centimètres ne sont qu'un affichage.
- **Logique métier séparée de l'affichage.** Toute la géométrie, les règles d'assemblage, la liste de découpe, la mise en page du PDF vivent dans des fonctions pures testées, sans React.
- **Les longueurs sont calculées, jamais stockées** (une tablette = largeur − montants, une cale = hauteur de l'étage − jeu) : le plan ne peut pas se contredire.
- **Un seul état global** modifié par des actions nommées, ce qui donne l'historique annuler / rétablir presque gratuitement.
- **Dessin 2D en SVG** ; PDF en dessin vectoriel avec [pdf-lib](https://pdf-lib.js.org/), chargé seulement quand on exporte ou importe un PDF.
- **Tout ce qui vient de l'extérieur est validé** (fichier importé, PDF, base du navigateur) avant d'être utilisé.

```text
src/
  model/      règles métier en fonctions pures : plan, tablettes, cales, liste de découpe, propagation, édition…
  store/      état de l'éditeur (actions nommées, historique)
  views/      composants React : vue de face, profil, panneau, assistant, bibliothèque…
  pdf/        mise en page du plan PDF (pure) et génération / lecture du fichier
  storage/    bibliothèque dans le navigateur (IndexedDB), export / import
  keyboard.ts raccourcis clavier
docs/         spécification, feuille de route, journal des décisions
```

## Documentation du projet

- [`docs/SPEC.md`](docs/SPEC.md) : ce que fait l'application (source de vérité fonctionnelle).
- [`docs/ROADMAP.md`](docs/ROADMAP.md) : où on en est, critères de « terminé », idées pour plus tard.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) : chaque choix technique et la raison.

## Limites connues

- Pensé pour **un ordinateur** (écran d'au moins 1280 px de large) ; pas de version téléphone pour l'instant.
- Testé surtout avec un navigateur de la famille Chrome ; conçu pour Chrome, Edge et Firefox récents.
- L'optimisation des découpes est en **une dimension** (planches d'une même section coupées en longueur) ; pas de calepinage de panneaux.
- Le modèle de construction (avec ou sans cadre) se choisit à la création et ne se change pas ensuite. Portes et tiroirs : modèle avec cadre seulement ; ni quincaillerie comptée ni estimation du prix (voir la feuille de route).

## Licence

[MIT](LICENSE) © 2026 Alticoco : vous pouvez utiliser, copier, modifier et redistribuer ce code, y compris dans un projet commercial, à condition de conserver la mention de copyright.
