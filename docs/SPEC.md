# Atelier Étagères — Spécification

> Application web personnelle pour concevoir des étagères en bois massif, ajuster leurs dimensions de façon interactive, et obtenir la liste des planches à faire découper.

## 1. Contexte et besoin

- Utilisateur : Alexis, usage personnel, occasionnel (pas quotidien).
- Problème : les plans d'étagères (mangathèques, étagère à épices…) étaient jusqu'ici dessinés à la main ; aucune application simple ne permettait de les faire sur ordinateur.
- Objectif : dessiner une étagère, la modifier facilement, et sortir un plan imprimable + une synthèse des planches à demander en magasin.
- Matériau : planches de **bois massif** achetées en grand format et découpées en magasin.
- Support : **ordinateur** (navigateur). Une version téléphone est une piste future, pas une contrainte du MVP.
- Publication : site **public** sur GitHub Pages, code open source (pièce de portfolio). Aucune donnée personnelle, aucun serveur, aucun compte.

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| **Étagère** (ou plan) | Un projet complet : dimensions globales + ensemble des pièces. |
| **Montant** | Planche verticale fixe formant un côté du cadre. |
| **Tablette** | Planche horizontale. Les tablettes du haut et du bas ferment le cadre. |
| **Étage** | Espace entre deux tablettes consécutives. |
| **Cale** | Planche verticale **non fixée**, posée dans un étage pour soutenir la tablette du dessus. Déplaçable librement en largeur. |
| **Trait de scie** | Épaisseur de bois perdue à chaque coupe (≈ 3 mm, paramétrable). |
| **Propagation** (option « intelligente ») | Mode où une modification se répercute automatiquement sur les pièces liées. |

## 3. Modèle constructif

### 3.1 Modèle « cadre » (MVP)

- Deux montants pleine hauteur, à gauche et à droite.
- Les tablettes (y compris haut et bas) sont placées **entre** les montants : longueur de tablette = largeur extérieure − épaisseur montant gauche − épaisseur montant droit.
- Option par plan : tablettes haut/bas **entre** les montants (défaut) ou **posées sur / sous** les montants (les montants sont alors raccourcis).
- Les tablettes sont vissées aux montants (2 vis par extrémité, représentées symboliquement sur le plan).
- Les cales :
  - hauteur = hauteur libre de l'étage − **jeu** (jeu paramétrable, défaut 1 mm, peut être 0) ;
  - profondeur = profondeur de la tablette par défaut, modifiable ;
  - épaisseur propre, modifiable ;
  - position horizontale libre (glisser ou saisir), pas de fixation.

### 3.2 Modèle « sans cadre / planches apparentes » (V2)

- Tablettes continues, verticales coupées à la hauteur de l'étage et fixées.
- Débord (porte-à-faux) de chaque tablette réglable par l'utilisateur, à gauche et à droite.
- Une extrémité peut se terminer uniquement par une tablette (pas de montant).

## 4. Fonctionnalités par version

### MVP (v1)

**Création**
- Assistant de création : largeur, hauteur, profondeur, nombre d'étages, épaisseurs par défaut (montants, tablettes, cales). Les étages sont répartis également.
- Démarrage aussi possible depuis un plan vierge minimal.

**Édition 2D**
- Vue de face 2D éditable (SVG), avec cotes affichées.
- Vue de profil 2D (lecture seule dans le MVP, montre la profondeur).
- Glisser à la souris : déplacer une tablette verticalement, une cale horizontalement, redimensionner le cadre (largeur, hauteur) par ses bords.
- Saisie clavier de toute cote dans un panneau de propriétés.
- Aimantation sur valeurs rondes, pas réglable (1 mm, 5 mm, 1 cm, 5 cm), désactivable (touche maintenue, ex. Alt).
- Action « espacer les tablettes également ».
- Ajout / suppression de tablettes et de cales.
- Sélection simple et **multiple** (Ctrl/Maj + clic, ou rectangle de sélection) pour appliquer un même paramètre (épaisseur, profondeur…) à plusieurs pièces.
- Chaque pièce paramétrable indépendamment (épaisseur, profondeur).
- **Propagation** activable/désactivable :
  - changer la largeur du cadre → toutes les tablettes suivent ;
  - changer la hauteur d'un étage → les cales de cet étage s'ajustent ;
  - changer la hauteur totale → les montants suivent.
- Annuler / rétablir (Ctrl+Z / Ctrl+Y), historique illimité dans la session.
- Unités : stockage interne en **millimètres entiers** ; affichage au choix mm ou cm (avec décimale au mm).
- Contrôles de cohérence : empêcher les chevauchements, les dimensions négatives, les cales plus hautes que l'étage.

**Sorties**
- Liste de découpe : pièces regroupées par dimensions identiques (longueur × largeur × épaisseur) avec quantité et repère (A, B, C…), repères reportés sur le plan.
- Option « trait de scie » : activable, épaisseur paramétrable ; ajoute une ligne d'estimation de perte.
- Export **PDF** type plan d'architecte : cartouche (nom, date, dimensions hors-tout, échelle), vue de face cotée, vue de profil cotée, liste de découpe, notes.
- Option « fixation murale » : ajoute une note et un repère sur le PDF.
- Le PDF **embarque les données du plan** (fichier JSON joint au PDF) : ré-importer ce PDF dans l'app restaure le plan éditable.

**Sauvegarde**
- Bibliothèque de plans enregistrés automatiquement dans le navigateur (IndexedDB) : créer, renommer, dupliquer, supprimer, ouvrir.
- Export / import d'un plan en fichier `.etagere.json` (sauvegarde de secours).

### V2

- Modèle sans cadre (planches apparentes, débords réglables).
- Arrondis : rayon des arêtes et des coins par pièce, représentés sur le plan et le PDF.
- Vue de profil éditable.
- Comparaison : plusieurs plans ouverts en onglets + écran partagé côte à côte.
- Étages de profondeurs différentes, tablettes de profondeurs mixtes plus poussées.
- Regroupement / optimisation des découpes (à confirmer : peut-être inutile).

### V3

- Vue 3D : rotation libre, zoom, déplacement de caméra.
- Blocs fermés : porte (coffret) et tiroirs sur un étage.

### Plus tard (idées)

- Simulation d'objets rangés (mangas, livres, grands livres, bocaux d'épices) et estimation de capacité.
- Alerte de flexion selon portée, épaisseur et charge.
- Estimation du prix.
- Version téléphone.

## 5. Hors périmètre (assumé)

- Catalogue des formats vendus en magasin : l'utilisateur fait sa recherche lui-même.
- Sens du fil du bois : non imposé.
- Comptes utilisateurs, synchronisation en ligne, partage.

## 6. Contraintes techniques

- Site statique, déployé sur GitHub Pages via GitHub Actions.
- Aucune donnée envoyée sur un serveur.
- Fonctionne sur Chrome, Edge et Firefox récents, écran ≥ 1280 px.
- Interface en français.

## 7. Critères de « terminé » pour le MVP

1. Je peux recréer une de mes mangathèques existantes en moins de 10 minutes.
2. La liste de découpe correspond exactement à ce que j'aurais calculé à la main.
3. Le PDF s'imprime lisiblement en A4 paysage.
4. Un PDF exporté puis ré-importé redonne le même plan.
5. Le site est en ligne sur GitHub Pages.

Puis : période de test réelle (étagère à épices), retours notés dans la feuille de route.
