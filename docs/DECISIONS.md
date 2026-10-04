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

## 2026-10-04 (étape 2)

- **Géométrie séparée du dessin** : `src/model/layout.ts` calcule la position de chaque pièce vue de face (fonction pure testée) ; `FrontView.tsx` ne fait que dessiner.
- **Caméra = centre + échelle (mm par pixel)**, dans `src/views/camera.ts`. Zoom autour du curseur, déplacement par glisser. Le cadrage automatique est recalculé tant que l utilisateur n a pas bougé la vue ; « Tout voir » le rétablit.
- **Cotes et textes à taille constante à l écran** quel que soit le zoom (dimensions converties en mm via l échelle de la caméra, traits en `non-scaling-stroke`).
- **Affichage en cm par défaut** (`formatLength`) ; le choix mm/cm viendra à l étape 4.
- **Plan d exemple temporaire** dans `App.tsx` jusqu à l assistant de création (étape 3).

## 2026-10-04 (étape 3)

- **Le formulaire est en cm, au mm près** (une décimale max, virgule ou point). La lecture et les erreurs sont dans `src/model/wizard.ts` (fonction pure testée), pas dans le composant React.
- **Aperçu en direct** de la vue de face pendant la saisie ; le bouton « Créer » reste grisé tant que le formulaire est invalide. Les erreurs propres à un champ s affichent sous ce champ, les incohérences entre champs (ex. hauteur trop faible) au-dessus des boutons.
- **Épaisseur des cales = option du plan** (`options.defaultWedgeThickness`, par défaut celle des tablettes) : elle servira aux cales créées à l étape 6. Un plan créé n a pas encore de cale.
- **Plan vierge minimal** = préremplit le formulaire (60 × 40 × 25 cm, 1 étage) ; l utilisateur valide ensuite comme d habitude.
- **Pas encore de sauvegarde** : « Nouvelle étagère » demande confirmation car le plan actuel est perdu (sauvegarde à l étape 10).

## 2026-10-04 (étape 4)

- **Store = reducer pur avec actions nommées** (`src/store/editor.ts`, via `useReducer`), sans bibliothèque externe. L historique annuler/rétablir (étape 7) s y branchera. L état contient le plan, la sélection et l unité d affichage.
- **Modifier une cote = fonction pure** (`src/model/edit.ts`) qui renvoie le nouveau plan ou une erreur. Le panneau l appelle pour afficher l erreur avant d agir ; le reducer l appelle aussi et ignore une modification refusée.
- **Contrôles de cohérence de base déjà en place** (`checkPlan`) : dimensions entières > 0, largeur suffisante, tablettes sans chevauchement ni dépassement, cales dans leur étage et dans le cadre. L étape 6 complétera (espacement, outils).
- **Règles de modification** : la tablette du haut reste collée au haut du cadre (si on change sa hauteur d épaisseur ou la hauteur totale) ; une tablette intermédiaire garde sa face inférieure quand son épaisseur change ; la largeur du cadre est libre (les longueurs de tablettes sont calculées).
- **Sélection** : clic = une pièce, Ctrl/Maj/Cmd + clic = ajouter/retirer, clic dans le vide ou Échap = tout désélectionner. Un appui qui bouge de plus de 4 px est un glisser (déplacement de la vue), pas un clic.
- **Panneau de propriétés** : sans sélection, cotes de l étagère ; avec sélection multiple, seulement les cotes communes (épaisseur, profondeur), champ vide « Valeurs différentes » si elles diffèrent ; position (hauteur ou x) seulement pour une pièce seule. Validation par Entrée ou sortie du champ, Échap annule.
- **Unité mm/cm** : bascule globale dans l en-tête, appliquée aux cotes du dessin et au panneau. Le formulaire de création reste en cm (valeurs par défaut en cm).

## 2026-10-04 (étape 5)

- **Un glisser = une seule modification.** Pendant le geste, la vue montre un plan provisoire (`draft`, local à `FrontView`) ; au relâchement, une seule action est envoyée au store. L étape 7 aura donc une entrée d historique par glisser, pas une par pixel.
- **La position se calcule depuis le point de départ du geste**, pas par petits déplacements cumulés : pas de dérive, et la valeur aimantée dépend seulement de la souris.
- **Aimantation sur la cote affichée** : pour une tablette, on aimante la hauteur libre de l étage du dessous (la cote du dessin), pas la hauteur absolue ; pour une cale, la position depuis le bord gauche ; pour le cadre, la largeur et la hauteur hors-tout. Pas réglable 1 mm / 5 mm / 1 cm / 5 cm (1 cm par défaut) ; **Alt maintenu = pas d aimantation** (mm entier).
- **Une pièce butte au lieu d être refusée** : `clampToValid` cherche par dichotomie la position valide la plus proche de la souris (`src/model/drag.ts`). Les règles viennent toutes de `checkPlan`, il n y a pas de seconde logique.
- **Une tablette ne passe jamais par-dessus une autre** (l ordre ne change pas), y compris par saisie au clavier : sinon les cales rattachées à une tablette changeraient d étage sans prévenir. Défaut trouvé par un test.
- **Au moins 1 mm libre entre deux tablettes** (un étage de 0 n a pas de sens). La règle des cales est plus stricte (hauteur de cale >= 1 mm après le jeu).
- **Déplaçables à la souris** : tablettes intermédiaires (vertical) et cales (horizontal). Les tablettes du haut et du bas ferment le cadre : elles se règlent au clavier ou en redimensionnant le cadre. Les montants ne bougent pas. Appuyer sur une pièce non déplaçable ou sur le fond déplace la vue.
- **Redimensionnement du cadre par trois poignées** invisibles à l extérieur du cadre : bord droit (largeur), bord haut (hauteur), coin haut-droit (les deux). L origine reste en bas à gauche ; pas de poignées gauche/bas. La vue est figée pendant le geste pour ne pas « sauter ».
- **Sélection par rectangle toujours reportée** (voir Boîte à idées).
