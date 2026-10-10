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

## 2026-10-04 (étape 6)

- **Propagation intelligente = adapter la disposition** (choix de l utilisateur). Les trois effets de la spec (tablettes qui suivent la largeur, cales qui suivent la hauteur de leur étage, montants qui suivent la hauteur) sont toujours automatiques car ces longueurs sont calculées, jamais stockées. L option ajoute en plus, si elle est activée (par défaut) : changer la **largeur** garde chaque cale à sa position proportionnelle ; changer la **hauteur** répartit les tablettes proportionnellement (chaque étage garde sa part). Désactivée : les cales restent à leur place et seule la tablette du haut suit la hauteur. Code dans `src/model/propagation.ts`.
- **Arrondis de la propagation en hauteur** faits sur les positions cumulées, donc la somme des étages reste exacte au mm.
- **« Espacer également »** répartit toutes les tablettes intermédiaires (haut et bas fixes) avec la même règle de reste que la création : les mm restants vont aux étages du bas. Pas encore limité à la sélection.
- **Ajouter une tablette** coupe un étage en deux au milieu (épaisseur et profondeur reprises de la tablette du dessous). **Ajouter une cale** se place au milieu de la plus grande place libre de l étage ; épaisseur = `defaultWedgeThickness`. Les nouvelles pièces sont sélectionnées. Les cales présentes dans un étage coupé restent dans la partie basse.
- **Supprimer** : seulement cales et tablettes intermédiaires (touche Suppr ou bouton). En supprimant une tablette, les étages fusionnent et ses cales passent dans l étage fusionné ; si elles se chevauchent alors, la suppression est refusée.
- **Contrôles de cohérence ajoutés** : deux cales d un même étage ne se chevauchent pas, une cale ne passe pas par-dessus sa voisine (comme pour les tablettes), au moins 1 mm libre entre deux tablettes (étape 5).
- **Les actions refusées sont expliquées** : `applyAction` (store) renvoie l état et un message ; `App.run` affiche le message dans un bandeau rouge (6 s) au lieu de refuser en silence. Défaut des tests : une action refusée ne change jamais l état.
- **Outils toujours visibles dans le panneau**, avec un choix d étage (par défaut celui de la pièce sélectionnée), pour enchaîner plusieurs ajouts sans désélectionner.

## 2026-10-04 (étape 7)

- **L historique vit dans le store** (`past` / `future` dans `EditorState`) : une action de modification du plan = un pas d historique. Un glisser (une seule action validée au relâchement), une saisie validée, un ajout, une suppression de plusieurs pièces sont donc chacun un seul pas. Rien de plus à brancher dans les vues.
- **On garde des versions complètes du plan, pas des différences.** Un plan est petit (quelques dizaines de pièces) et les mises à jour sont immuables, donc les versions successives partagent leurs données : simple, sans risque d erreur de « défaire à l envers ». Historique illimité dans la session, comme la spec.
- **Seul le plan est annulable** : sélection, unité mm/cm et aimantation ne le sont pas, et annuler ne les modifie pas.
- **Pas d entrée pour une action refusée ni pour une action qui ne change rien** (ex. renommer avec le même nom, « espacer » un plan déjà réparti) : comparaison du contenu du plan avant/après.
- **Une nouvelle modification efface la partie « rétablir »** ; **un nouveau plan** (assistant) repart d un historique vide.
- **Après annuler / rétablir, la sélection ne garde que les pièces qui existent encore.**
- **Raccourcis** : Ctrl+Z annuler, Ctrl+Y ou Ctrl+Maj+Z rétablir (Cmd sur Mac). Ils sont laissés au navigateur quand le curseur est dans un champ texte, où Ctrl+Z annule la frappe. Boutons Annuler / Rétablir dans l en-tête, grisés quand il n y a rien à faire.

## 2026-10-04 (étape 8)

- **Vue de profil depuis le côté gauche** : le mur est à gauche, l avant à droite, le montant gauche au premier plan. Toutes les pièces sont alignées contre le mur (x = 0) ; la spec ne prévoit pas de décalage en profondeur. Un petit bandeau « Mur » rappelle l orientation (utile aussi pour la future note de fixation murale).
- **Traits cachés en pointillés** : le montant droit, les cales et les tablettes situées entre les montants sont cachés par le montant du premier plan, donc en pointillés sans remplissage. Avec « tablettes du haut et du bas posées sur / sous les montants », ces deux tablettes dépassent et sont dessinées en plein. Logique pure dans `src/model/profile.ts` (testée).
- **Lecture seule** : on peut zoomer, déplacer la vue, et la sélection faite en vue de face est surlignée ; on ne modifie rien depuis le profil (vue éditable = V2).
- **Sélecteur Face / Profil** au-dessus du dessin (une vue à la fois, plus grande, plutôt que deux petites côte à côte).
- **Cotes du profil** : profondeur hors-tout en bas, hauteur et hauteurs libres des étages à droite (pas à gauche, pour ne pas croiser le mur). La profondeur affichée est celle de la pièce la plus profonde.
- **Code partagé extrait** : `useViewport` (zoom, déplacement, cadrage), `Dimension` (lignes de cotes) et `ViewControls` (boutons) servent aux deux vues. Un correctif dans l une profite à l autre.
- **Échap et Suppr** fonctionnent maintenant même quand le focus est sur un bouton radio / case à cocher (ils restent réservés aux champs de saisie et aux listes déroulantes).

## 2026-10-04 (étape 9)

- **Regroupement par dimensions identiques** (longueur × largeur × épaisseur) : calcul pur dans `src/model/cutlist.ts`. Une cale et une tablette de mêmes dimensions vont dans le même lot. Des pièces qui ne diffèrent que d un mm restent dans des lots séparés (c est ce qu on fait à la main).
- **Repères A, B, C… dans l ordre d apparition** : montants, tablettes de bas en haut, puis cales ; AA, AB… après Z. Les repères sont recalculés à chaque changement de dimensions : ils ne sont pas stables d une modification à l autre, ils ne doivent donc servir qu à partir de la liste affichée.
- **Convention de dimensions** : longueur = dimension principale de la pièce (hauteur d un montant ou d une cale, largeur utile d une tablette), largeur = profondeur, épaisseur = épaisseur. On ne parle pas de sens du fil (hors périmètre de la spec).
- **Estimation du trait de scie = une coupe par pièce × épaisseur du trait** (3 mm par défaut), affichée sur une ligne « Perte ». C est volontairement simple : sans optimisation des découpes, on ne peut pas savoir combien de coupes un magasin fera vraiment. Option (case + épaisseur) dans les propriétés de l étagère.
- **Repères reportés sur la vue de face**, avec une case « Repères » pour les masquer (activée par défaut). Textes non cliquables, avec contour blanc pour rester lisibles sur le bois. Le profil n en porte pas pour l instant ; le PDF (étape 11) les reprendra.
- **Onglet « Découpe »** à côté de Face et Profil : un tableau en lecture seule (repère, quantité, longueur, largeur, épaisseur, pièces concernées, total, perte). Unités mm/cm suivent le réglage global.
- **Idée notée** : synthèse des longueurs par section de planche (boîte à idées), non faite car la spec ne la demande pas.

## 2026-10-04 (étape 10)

- **Format de fichier `.etagere.json`** = `{ format: "atelier-etageres", version: 1, plan }`, défini dans `src/model/serialize.ts`. Même format pour la bibliothèque et, à l étape 11, pour le plan embarqué dans le PDF. Le champ `version` permet de migrer plus tard ; un fichier d une version plus récente est refusé avec un message clair.
- **Tout ce qui vient de l extérieur est validé strictement** (`parsePlan`) : un fichier importé mais aussi un enregistrement relu depuis la base. Types, entiers, bornes (jusqu à 100 000 mm, 200 tablettes, 1000 cales), identifiants uniques, puis les contrôles de cohérence (`checkPlan`). Le plan est reconstruit champ par champ : rien d inattendu du fichier n est conservé (testé, y compris `__proto__`). Taille de fichier limitée à 5 Mo.
- **IndexedDB derrière une interface `PlanStore`** (`src/storage/planStore.ts`), avec une version en mémoire pour les tests. La bibliothèque (`library.ts`) est testée sur les deux, et l IndexedDB réel est simulé avec `fake-indexeddb` (dépendance de test uniquement). Pas de bibliothèque tierce pour IndexedDB : le besoin est de quatre opérations.
- **Enregistrement automatique** 0,5 s après la dernière modification (regroupe les rafales), plus enregistrement immédiat en quittant l éditeur, en cachant l onglet ou en fermant la page. Indicateur « Enregistrée dans ce navigateur / Enregistrement… / Échec / Non enregistrée » dans l en-tête.
- **L historique annuler / rétablir n est pas sauvegardé** : à la réouverture d un plan, on repart d un historique vide.
- **Écran d accueil « Mes étagères »** (ouvrir, renommer, dupliquer, exporter, supprimer, importer). Suppression avec confirmation ; plus de confirmation « le plan sera perdu » dans l éditeur puisque tout est enregistré (elle reste seulement si le stockage est indisponible).
- **Stockage indisponible** (navigation privée, stockage bloqué) : l application fonctionne quand même, avec un avertissement et l export comme sauvegarde de secours.
- **Enregistrements illisibles ignorés** et signalés (« N étagères illisibles ignorées ») au lieu de bloquer toute la liste.
- **Nom de fichier d export** sans accents ni caractères interdits (« Etagere-a-epices.etagere.json »). Un nom vide est refusé au renommage ; un nom vide dans un fichier importé devient « Étagère ».
- **Un import crée toujours une nouvelle entrée** (jamais d écrasement d une étagère existante), même si le nom est déjà pris.

## 2026-10-04 (étape 11)

- **Bibliothèque PDF : `pdf-lib`** (licence MIT, sans réseau). Elle dessine en vectoriel, sait joindre un fichier et le relire. Inconvénient connu : elle n est plus mise à jour depuis 2021, mais elle est stable et très répandue ; le code PDF est isolé dans `src/pdf/` si on veut la remplacer.
- **Chargée à la demande** (`import()` dynamique) : le site garde ~86 Ko compressés, et ~180 Ko de plus ne sont chargés que quand on exporte ou importe un PDF. C est un fichier de code du même site, pas une donnée envoyée ou reçue : la règle « aucune requête réseau » vise les données. À savoir si un jour le site doit marcher hors ligne (il faudra alors un cache de l application).
- **Mise en page séparée du rendu** : `src/pdf/scene.ts` construit la page A4 paysage comme une liste de primitives (traits, rectangles, cercles, textes en mm), fonction pure testée ; `src/pdf/pdf.ts` ne fait que les tracer. Vérifié visuellement avec un lecteur indépendant (PyMuPDF) : page 297 × 210 mm, 0 image, texte extractible.
- **Contenu de la page** : vue de face cotée (largeur, hauteur, hauteur de chaque étage, repères A, B… dans des pastilles), vue de profil cotée (profondeur, hauteur, mur hachuré, traits cachés en pointillés), liste de découpe, notes, cartouche (nom, dimensions hors-tout, échelle, date, application). Noir et blanc, traits >= 0,2 mm, textes >= 6 pt.
- **Échelle choisie automatiquement** parmi 1:1, 1:2, 1:2,5, 1:5, 1:10, 1:20, 1:25, 1:50, 1:100, 1:200 : la plus grande pour laquelle les deux vues et leurs cotes tiennent dans leur zone. Une seule échelle pour les deux vues, comme sur un plan d architecte.
- **Le plan éditable est joint au PDF** sous le nom `plan.etagere.json` (même format que la sauvegarde). Il est toujours en mm, quelle que soit l unité d affichage du PDF. Relecture : on cherche un fichier joint dont le nom finit par `.etagere.json`, puis `parsePlanFile` le valide comme n importe quel fichier importé. Aller-retour testé : le plan ré-importé est identique, y compris dans le navigateur avec la vraie base.
- **Limites de lecture d un PDF** : 20 Mo, pièce jointe 2 Mo, arbre des fichiers joints limité en profondeur et en nombre. Reste un risque connu et accepté : un PDF volontairement piégé (« bombe de décompression ») peut faire ramer l onglet ; l utilisateur n importe que ses propres fichiers.
- **Texte du PDF** : police Helvetica standard (WinAnsi). Les caractères qu elle ne sait pas écrire (émojis, idéogrammes) sont remplacés par « ? » **dans le dessin seulement** ; le nom exact reste dans le fichier joint.
- **Option « fixation murale »** (`options.wallMount`, désactivée par défaut) : ajoute la note et une pastille « F » sur le mur de la vue de profil, avec légende. **Rétrocompatible** : un fichier écrit avant cette option reste lisible (elle vaut « non »), donc pas de changement de version du format. Le texte de la note est volontairement générique (équerres ou tasseau, chevilles adaptées au mur) : je ne donne pas de dimensionnement.
- **Menu « Exporter »** : Plan PDF, ou Fichier de sauvegarde `.etagere.json`. L import de la bibliothèque accepte les deux (reconnus à leur contenu, pas à leur extension).
- **En-tête compacté** : une seule ligne à 1280 px (boutons sans retour à la ligne, nom du plan tronqué si nécessaire, indicateur d enregistrement raccourci).

## 2026-10-04 (étape 12)

- **Raccourcis clavier = table pure testée** (`src/keyboard.ts`, `commandForKey`) : la touche donne une commande, l application l exécute. Ajouts : flèches pour déplacer la pièce sélectionnée (un pas d aimantation, Maj = 1 mm), Ctrl+A tout sélectionner, Ctrl+S enregistrer maintenant (bloque la boîte « Enregistrer sous » du navigateur), 1 / 2 / 3 pour les vues, ? pour l aide. Alt + flèche est laissé au navigateur (page précédente), d où Maj pour le déplacement fin. Chaque appui de flèche est un pas d historique.
- **Les raccourcis laissent les champs de saisie tranquilles** : dans un champ texte, Ctrl+Z annule la frappe, les flèches déplacent le curseur, Suppr supprime du texte. Seul Ctrl+S fonctionne partout. Les flèches ne font rien dans une liste déroulante.
- **Fenêtre d aide** (touche ? ou bouton ?) alimentée par la même liste que le code (`SHORTCUTS`), focus piégé dans la fenêtre puis rendu à la fermeture.
- **Design** : feuille de style réécrite en une seule, par sections, avec des variables (couleurs, rayons, ombres). Un seul style de bouton (secondaire, principal, danger) au lieu de six copies. Couleur d accent plus foncée pour que le texte blanc dessus ait un contraste conforme. Anneau de focus visible partout. Panneau « Étagère » regroupé en sections (Dimensions, Montage, Cales, Découpe, Outils). Cartes pour la bibliothèque. Largeur minimale 1100 px.
- **Identité** : logo (étagère avec deux tablettes et une cale) dans l en-tête et en favicon ; le favicon par défaut de Vite (qui traînait depuis l étape 0) est remplacé. Description et couleur de thème dans la page.
- **Page d erreur de secours** (`ErrorBoundary`) : une erreur imprévue affiche un message et un bouton « Recharger » au lieu d une page blanche, et rappelle que les étagères enregistrées ne sont pas perdues. Testée en provoquant une panne temporaire.
- **Critères de « terminé » prouvés par des tests** (`src/acceptance.test.ts`) : calculs de découpe écrits à la main dans les commentaires, contraintes d impression du PDF, aller-retour PDF. Les critères 1 (chrono avec une vraie étagère) et le papier du critère 3 ne peuvent pas être validés par du code : ils sont dans la période de test.
- **Textes du cartouche PDF à 6 pt au minimum** (5,5 pt avant) : seuil de lisibilité retenu pour toute la page.
- **Licence non choisie** : le README dit « à définir » ; sans fichier de licence, le code est publié mais pas juridiquement « open source ». À décider par l auteur.
- **Correction d une erreur de suivi** : la feuille de route montrait les étapes 10, 11 et 12 comme terminées depuis l étape 1 (un `sed` sur « Étape 1 » cochait aussi 10, 11 et 12 par préfixe). Les étapes 10 et 11 ont bien été réalisées à leur tour ; l étape 12 ne l est qu à ce commit. Les cases se cochent désormais avec le numéro exact.

## 2026-10-04 (licence)

- **Licence MIT** (fichier `LICENSE`, champ `license` de `package.json`, section du README), au nom d Alexis Meyrignac, année 2026. Remplace la décision « licence à définir » de l étape 12. Choix : la plus courante pour un projet de portfolio, très permissive, une seule obligation (garder la mention de copyright). Les dépendances ont leurs propres licences, toutes permissives (pdf-lib : MIT).

## 2026-10-04 (licence, précision)

- **Le copyright de la licence MIT est au nom « Alticoco »** (pseudo GitHub de l auteur) et non à un nom civil, à la demande de l auteur. Remplace le nom indiqué dans l entrée « licence » ci-dessus (l historique est conservé, on n y réécrit rien).

## 2026-10-05 (étape 13 — modèle sans cadre)

- **Ordre de la V2 choisi avec l'auteur** : modèle sans cadre d'abord (les arrondis et le profil éditable s'appuient dessus), test du MVP en parallèle.
- **Interprétation de la spec §3.2, validée par l'auteur** : tablettes continues avec un débord réglable à gauche et à droite ; montants coupés à la hauteur libre de chaque étage, **un à gauche et un à droite à chaque étage**, alignés sur le corps ; chaque montant se supprime individuellement (l'extrémité se termine alors par la seule tablette). Les séparations intérieures restent les cales.
- **Largeur = hors-tout, débords compris** (ce qu'on mesure sur le mur, et la longueur de la planche à acheter). Le corps (faces extérieures des montants) se déduit : le plus grand débord de chaque côté touche le bord hors-tout, donc `corps = largeur − débord gauche max − débord droit max`. Tout est dans `src/model/geometry.ts`.
- **Modèle choisi à la création seulement** : pas de conversion d'un plan existant (noté dans la boîte à idées). Les plans existants sont des plans avec cadre, **strictement inchangés** : tous les tests de l'ancien modèle passent sans modification.
- **Données** : `Plan.model` (`frame` / `frameless`) ; chaque tablette porte `overhangLeft`, `overhangRight`, `verticalLeft`, `verticalRight` (montant dans l'étage **au-dessus** de cette tablette, comme une cale est rattachée à la tablette du dessous). Ces champs sont ignorés par le modèle avec cadre.
- **Compatibilité des fichiers sans changer de version** : un fichier écrit avant (sans `model` ni débords) se lit comme un plan avec cadre (débords 0, montants présents). C'est un ajout facultatif.
- **Montants d'un même côté partagent épaisseur et profondeur** (`leftUpright`, `rightUpright`) : modifier l'un modifie tous ceux du côté (le panneau l'indique). Identifiants `vertical-left-shelf-2` (côté + tablette du dessous), libellés « Montant gauche, étage 2 ».
- **Cales** : toujours entre les faces intérieures des montants (`innerSpan`), même si un montant est supprimé à cet étage (règle prudente, simple). La propagation de largeur garde leur position relative dans cet espace.
- **Vue de profil sans cadre** : les tablettes montrent leur tranche, donc elles sont pleines ; montants de gauche pleins ; montants de droite et cales en pointillés.
- **Débord de 0 permis** (tablette qui affleure les montants). Un débord qui ne laisse plus de place entre les montants est refusé avec un message.
- **PDF et liste de découpe** suivent automatiquement (même code). Note dédiée sur le PDF ; la désignation des lots utilise le type de pièce (« Mixte » quand un lot réunit montants et cales de mêmes dimensions).
- **Reporté (boîte à idées)** : conversion entre modèles, cotes de débord et de largeur du corps sur le dessin.

## 2026-10-05 (étape 14 — arrondis)

- **Deux rayons par pièce, validés par l'auteur** : `cornerRadius` (les quatre coins de la silhouette vue de face) et `edgeRadius` (la tranche, vue de profil : coins de la section profondeur × hauteur). Tous deux à 0 par défaut : un plan existant ne change pas d'un pixel.
- **Les quatre coins de la pièce** (pas seulement les « coins libres ») : simple et prévisible, c'est l'utilisateur qui choisit quelles pièces arrondir. La détection des coins libres (qui ne touchent aucune autre pièce) a été écartée : complexe et surprenante avec les cales, le jeu et les débords.
- **Plafond du rayon = moitié de la plus petite dimension visible**, en mm entiers arrondis vers le bas : coins = plus petit côté de la silhouette (9 mm pour du bois de 18 mm), arêtes = plus petit côté de la section de profil. Contrôle dans `checkPlan` (`src/model/rounding.ts`) avec un message qui nomme la pièce et donne le maximum ; il se déclenche aussi si une épaisseur est réduite après coup. Le panneau affiche le maximum commun à la sélection.
- **L'arrondi ne change pas les dimensions de coupe** (la planche est coupée droite puis arrondie). En revanche, **deux pièces de mêmes dimensions mais d'arrondis différents forment deux lots** dans la liste de découpe, avec une colonne « Arrondi » (« coins R 0,9 cm · arêtes R 0,5 cm »).
- **Données** : champs ajoutés aux montants, tablettes et cales. Comme pour l'épaisseur, les montants d'un même côté (modèle sans cadre) partagent leurs arrondis ; une nouvelle tablette reprend ceux de la tablette du dessous. Un fichier écrit avant cette étape se lit avec des angles droits (champs facultatifs, pas de changement de version du format).
- **Dessin à l'écran** : `rx` / `ry` SVG sur chaque pièce, en mm du dessin, donc exact à tout zoom (un rayon de 5 mm sur du bois de 18 mm est discret à l'échelle de l'écran).
- **PDF** : `pdf-lib` n'a pas de rectangle arrondi ; le contour est tracé comme un chemin SVG (`roundedRectPath`), avec remplissage et pointillés conservés. Vérifié en rendant le PDF avec un lecteur indépendant. Colonne « Arrondi » en abrégé (`C0,9 A0,5`, C = coins, A = arêtes) plus une légende dans les notes, seulement s'il y a des arrondis. Colonnes du tableau resserrées pour la faire tenir.
- **Reporté** : arrondir seulement certains coins d'une pièce ; rayon par défaut dans l'assistant.

## 2026-10-05 (étape 15 — vue de profil éditable)

- **Ce qui s'édite dans le profil, validé par l'auteur** : la profondeur des pièces (tirer le bord avant) et la hauteur des tablettes intermédiaires (comme en vue de face). Rien d'autre : pas de redimensionnement du cadre ni de déplacement horizontal des cales (sans sens en profil).
- **Choisir une pièce parmi des pièces superposées = la plus petite sous le curseur** (`pickProfilePiece`, `src/model/profilePick.ts`) : une tablette fine passe avant le grand montant qui la recouvre. À surface égale : tablette, puis cale, puis montant. Les pièces cachées (pointillés) sont choisissables. Tolérance de 3 px autour de chaque pièce pour attraper une tablette fine. Plutôt qu'un test de clic du navigateur (qui ne voit pas l'intérieur d'une pièce « sans remplissage »), le calcul se fait à partir des coordonnées du dessin, donc il est testé sans navigateur.
- **Poignée de profondeur** : une barre juste devant le bord avant de **chaque pièce sélectionnée**, visible seulement pour la sélection (sinon des dizaines de poignées superposées). La sélection est partagée avec la vue de face : choisir en face puis tirer en profil fonctionne, et `Ctrl+A` sélectionne tout.
- **Plusieurs pièces sélectionnées : elles prennent toutes la même profondeur** (même règle que le panneau de propriétés), choix de l'auteur. Aimantation sur la profondeur absolue, `Alt` pour la désactiver.
- **La valeur s'arrête à ce que le plan autorise** (`dragDepth`, `src/model/drag.ts`) : par exemple un arrondi d'arête de 9 mm impose une profondeur d'au moins 18 mm pour une tablette de 18 mm. Recherche par dichotomie ; si la profondeur de départ de la sélection n'est elle-même pas valide (profondeurs très différentes), recherche pas à pas de la valeur valide la plus proche, bornée.
- **Un glisser = une seule modification** (aperçu en direct, action validée au relâchement), donc un seul pas d'historique ; la vue est figée pendant le geste pour ne pas « sauter ». Même mécanique que la vue de face.
- **Aide à l'écran** dans le profil (bas à gauche) pour la découvrabilité : le clic « plus petite pièce » et la poignée ne sont pas évidents sans.
- **Reporté (boîte à idées)** : liste cliquable des pièces ; glisser à écart constant au lieu de profondeur commune.

## 2026-10-05 (étape 16 — onglets et écran partagé)

- **Un onglet = un plan ouvert avec son propre éditeur** (plan, sélection, annuler / rétablir). Annuler dans un onglet ne touche jamais l'autre. L'unité et l'aimantation restent des réglages globaux, recopiés dans tous les onglets (`src/store/workspace.ts`, fonctions pures testées ; `editor.ts` est inchangé).
- **Ouvrir un plan déjà ouvert ramène à son onglet** (au lieu d'en créer un second) : évite deux copies du même plan qui s'écraseraient à l'enregistrement. Deux plans non enregistrés restent deux onglets.
- **Les onglets restent ouverts quand on va dans « Mes étagères » ou l'assistant** ; « Mes étagères » est la première entrée de la barre d'onglets, « + » crée une étagère. Ancien avertissement « le plan actuel sera perdu » supprimé pour la création (rien n'est perdu) ; fermer un onglet non enregistré demande confirmation.
- **Écran partagé = deux volets côte à côte**, chacun avec sa vue (Face / Profil / Découpe) et un menu pour choisir son plan ; un plan n'apparaît jamais dans les deux volets (on échange). Le volet cliqué a le focus (cadre coloré) : c'est lui qui reçoit les raccourcis clavier, le panneau de propriétés, l'en-tête (annuler, exporter, nom). Fermer l'un des deux plans referme l'écran partagé.
- **Enregistrement automatique par onglet** (`useAutosave` gère une liste de plans) ; un onglet est enregistré avant d'être fermé. Renommer ou supprimer un plan dans la bibliothèque est répercuté dans son onglet ouvert (sans pas d'historique pour le renommage).
- **Reporté** : mémoriser les onglets entre deux visites, copier une pièce d'un plan à l'autre, zoom synchronisé.

## 2026-10-10 (profondeur dans les dimensions hors-tout)

- **Champ « Profondeur » ajouté aux dimensions hors-tout** du panneau de l'étagère (à côté de largeur et hauteur). Le modèle stocke la profondeur par pièce (pas de profondeur globale) : saisir une valeur donne **la même profondeur à toutes les pièces** (montants, tablettes, cales), en un seul pas d'historique. Si les pièces ont des profondeurs différentes (étape 15), le champ est vide (« Valeurs différentes ») avec une note ; la saisie les uniformise. Les profondeurs par pièce restent réglables au clic (panneau ou vue de profil).

## 2026-10-10 (étape 17a — cales d'un étage à l'autre)

- **Une cale se glisse dans les deux sens** (horizontal et vertical) ; l'étage visé est celui sous le curseur (le plus proche si le curseur est sur une tablette). Sa hauteur s'adapte seule (hauteur libre − jeu), car elle est calculée. Fonction pure `moveWedge` (`src/model/tools.ts`), action `placeWedge` : un glisser = un pas d'historique.
- **Aimantation** : la position est arrondie au pas réglé, puis collée contre le montant ou la cale voisine si elle en est à moins de 10 mm (`MAGNET_MM`). Alt désactive l'arrondi et l'aimantation. Une cale ne chevauche jamais une voisine : elle se range dans la place libre la plus proche.
- **Reporté** : « Couper ici » (étape 17b) touche au cœur du modèle (les tablettes et montants traversent aujourd'hui toute la largeur / hauteur) ; la conception est à valider avec l'auteur. L'ancienne étape 17 (optimisation) devient l'étape 18.

## 2026-10-10 (étape 17c — simulation de rangement)

- **Rangées d'objets stockées dans le plan** (`plan.rows`, facultatif) : type d'objet + nombre + étage (tablette du dessous, comme les cales). Elles sont enregistrées avec le plan mais **n'ont aucun effet sur le bois** : ni liste de découpe, ni contrôles de cohérence, ni PDF. Fichiers anciens inchangés (champ absent, pas de changement de version).
- **Catalogue fixe de 5 objets aux dimensions courantes** (`OBJECT_KINDS`, `src/model/objects.ts`) : manga 14 × 175 × 115 mm, livre de poche 25 × 177 × 108, livre grand format 30 × 215 × 140, grand livre / BD 25 × 320 × 240, bocal d'épices 55 × 100 × 55. **Ces dimensions sont mes estimations** (aucune n'avait été donnée) : à corriger par l'auteur.
- **Rangement debout, côte à côte, de gauche à droite** depuis le montant, en sautant les cales. La quantité vide = « remplir » ce qui reste. Les objets qui n'ont plus de place sont comptés (« N sans place ») ; un objet plus haut que l'étage ou plus profond que la tablette est dessiné en rouge pointillé et signalé.
- **Dessin dans la vue de face seulement**, non cliquable. Reporté (boîte à idées) : vue de profil, PDF, objets sur mesure, objets couchés ou empilés.

## 2026-10-10 (étape 17d — fiche d'objet et copie des cales)

- **Fiche d'information par objet** : un bouton rond « i » à côté du choix de l'objet et sur chaque rangée ouvre une fiche (largeur, hauteur, profondeur, hauteur d'étage et profondeur de tablette nécessaires, nombre par mètre). Dimensions indicatives, dans l'unité choisie (mm / cm).
- **Copier les cales d'un étage vers d'autres** (`copyStageWedges`, `src/model/tools.ts`) : l'étage source est celui choisi dans « Outils » ; la destination est un étage ou « tous les autres ». Mêmes positions, épaisseurs, profondeurs et arrondis ; **les cales déjà présentes dans l'étage visé sont remplacées** (on récupère la même disposition, sans doublon). Un étage source sans cale vide les étages visés (le panneau le dit). Un seul pas d'historique.

## 2026-10-10 (étape 18a — supports)

- **Un support = une boîte à part** (`plan.supports`, facultatif, rétrocompatible) : bord gauche `x`, dessous `y` (négatif = sous l'étagère), `z` = recul entre le mur et sa face arrière, largeur / hauteur / profondeur. Placement libre : sous (cas courant), à gauche, à droite. Pas dans `computePieces` : ce ne sont pas des pièces de l'étagère.
- **Vue de dessous ajoutée** (touche 4) : mur en haut, gauche / droite comme en vue de face (pas de miroir, plus simple à lire). Montre la tablette du bas, les montants en pointillés et les supports. Les supports se tirent dans les trois vues (un glisser = un pas d'historique) ; le glisser s'aimante contre le mur, l'avant de l'étagère, le dessous du cadre et les bords (10 mm), Alt désactive. Les cotes de recul (derrière et devant) s'affichent pour le support choisi, pour régler le « petit gap » derrière un support collé à l'avant.
- **Nouveau support « sous l'étagère »** : collé à l'avant et au dessous du cadre, 10 × 4 × 10 cm, aux deux bords puis au milieu ; « Coller à l'avant » recale la face avant sur la pièce la plus profonde.
- **Liste de découpe à part** (repères S1, S2…, longueur = plus grande cote) : ils ne comptent pas dans le total des pièces de l'étagère. **Choix par défaut, non confirmé par l'auteur.** Pas encore dans le PDF (étape 18b).
- **Le cadrage des vues tient compte des supports** qui dépassent de l'étagère.
- **`LengthField` extrait** dans son propre fichier pour être partagé par le panneau et les supports.

## 2026-10-10 (étape 17e — objets un par un, cotes cliquables)

- **Objets de simulation individuels** : chaque objet dessiné se clique (identifiant `obj:row-1:3` pour le 4e d'une rangée, `obj:placed-2` pour un objet posé seul). Supprimer (bouton ou touche Suppr) retire un objet : la rangée se resserre. **Déplacer un objet de rangée le détache** en objet posé seul (`plan.placedObjects`) : il passe d'un étage à l'autre, s'arrondit au pas, s'aimante contre le montant, les cales ou un autre objet (10 mm), jamais par-dessus. Les rangées se rangent autour des objets posés seuls, qui comptent comme des obstacles. Un glisser = un pas d'historique. La rangée automatique « tout collé » est conservée.
- **Espace entre objets** : champ par rangée (`gap`, 0 à 500 mm, 0 par défaut) et valeur proposée à la création d'une rangée ; « remplir » en tient compte. Rétrocompatible (champs facultatifs, pas de changement de version du format).
- **Cotes cliquables** (`EditableDimension`) en vues de face, de profil et de dessous : un clic ouvre un champ à la place du texte, Entrée applique, Échap annule. Largeur, hauteur et profondeur appellent les mêmes règles que le panneau (la profondeur de profil uniformise toutes les pièces). **Hauteur d'un étage = `setStageHeight`** : elle déplace la tablette du dessus si elle est intermédiaire, sinon celle du dessous ; une étagère d'un seul étage change de hauteur ; les étages voisins s'adaptent, et un refus est expliqué (une tablette ne passe jamais par-dessus une autre).
