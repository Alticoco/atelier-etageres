# Atelier Étagères — instructions pour Claude Code

Application web statique pour concevoir des étagères en bois massif (2D d'abord, 3D plus tard), produire une liste de découpe et un plan PDF.

## À lire avant toute tâche

1. `docs/SPEC.md` — ce que fait l'app (source de vérité fonctionnelle).
2. `docs/ROADMAP.md` — où on en est. Travailler uniquement sur la première étape non terminée, sauf demande contraire.
3. `docs/DECISIONS.md` — choix déjà faits. Ne pas les remettre en cause sans le signaler.

## Façon de travailler

- Une étape de la feuille de route à la fois. À la fin d'une étape : tests verts, build OK, case cochée dans `ROADMAP.md`, un commit clair en français.
- Si une demande n'est pas couverte par la spec ou la contredit : poser la question avant de coder.
- Toute nouvelle idée qui sort du périmètre de l'étape en cours va dans la « Boîte à idées » de `ROADMAP.md`, pas dans le code.
- Toute décision technique notable s'ajoute à `DECISIONS.md`.
- L'utilisateur n'est pas développeur professionnel : expliquer brièvement ce qui a été fait et comment le tester (commande, ce qu'il doit voir).

## Conventions techniques

- Vite + React + TypeScript strict. Tests avec Vitest.
- Unité interne : **millimètres entiers** partout dans le modèle. Conversion cm uniquement à l'affichage.
- La logique métier (géométrie, règles d'assemblage, liste de découpe, propagation) vit dans `src/model/`, en fonctions pures testées, sans dépendance à React.
- Rendu 2D en SVG dans `src/views/`. La future 3D lira le même modèle.
- État global avec historique (annuler/rétablir) : un seul store, mutations via actions nommées.
- Interface et textes en français. Code (noms de variables, fonctions) en anglais.
- Aucune requête réseau à l'exécution ; aucune donnée envoyée nulle part.

## Commandes

- `npm run dev` — serveur local
- `npm test` — tests
- `npm run build` — build de production
- Déploiement : automatique sur GitHub Pages à chaque push sur `main` (GitHub Actions).
