# CIRCO+ — Annuaire de circonscription

Application web autonome (HTML / CSS / JavaScript) permettant aux personnels
d'une circonscription du 1er degré de retrouver rapidement les coordonnées
des **écoles**, de l'**équipe de circonscription** et des **mairies**.

Aucun serveur, aucune base de données : tout fonctionne dans le navigateur.

## 1. Utilisation immédiate

Il suffit d'ouvrir le fichier **`index.html`** dans un navigateur récent
(Chrome, Edge, Firefox, Safari) — en local (double-clic) ou hébergé sur
n'importe quel serveur web statique (intranet académique, clé USB, Google
Drive avec extension "web server", etc.).

Aucune installation, aucune compilation n'est nécessaire.

## 2. Structure des fichiers

```
index.html            → page principale
css/style.css          → habillage graphique (charte bleu/blanc/gris EN)
js/app.js               → logique de l'application
js/xlsx.full.min.js     → librairie SheetJS (lecture/écriture Excel, 100% locale)
data/data.js             → données par défaut, générées depuis APPLI_CIRCO.xlsx
data/data.json            → mêmes données au format JSON brut (référence)
```

## 3. Mettre à jour les données (sans toucher au code)

Deux façons de mettre à jour l'annuaire à partir d'un nouveau fichier Excel :

**a) Depuis l'application (recommandé)**
Menu **⚙ Paramètres → Mettre à jour les données**, puis sélectionner le
nouveau fichier `.xlsx`. Le fichier doit respecter la même structure que
`APPLI_CIRCO.xlsx` (feuilles `Circo`, `Ecoles`, `Mairies`, avec les mêmes
en-têtes de colonnes). Les nouvelles données sont enregistrées dans le
navigateur (LocalStorage) et remplacent les données par défaut. Un bouton
« Revenir aux données d'origine » permet d'annuler à tout moment.

**b) En remplaçant le fichier embarqué**
Régénérer `data/data.js` à partir d'un nouveau fichier Excel (utile pour
publier une nouvelle version « par défaut » de l'application, par exemple
en début d'année scolaire) — un export JSON équivalent est fourni dans
`data/data.json` à titre de modèle de structure.

## 4. Fonctionnalités principales

- **Recherche instantanée** globale (barre du haut) et par page (nom,
  commune, directeur, secteur de collège, membre de l'équipe…)
- **Fiches détaillées** : la fiche d'une école affiche automatiquement la
  mairie correspondante, le maire, le syndicat scolaire et la communauté de
  communes.
- **Favoris** (⭐) enregistrés localement (LocalStorage), disponibles hors
  connexion.
- **Actions rapides** : appel téléphonique, mail, Google Maps, copie
  rapide d'un numéro/mail, impression de fiche / export PDF (impression
  ciblée), export Excel des résultats de recherche.
- **Tableau de bord** : nombre d'écoles / communes / mairies / personnels,
  accès rapide aux derniers éléments consultés.
- **Mode sombre**, interface responsive (ordinateur, tablette, smartphone).

## 5. Confidentialité

Toutes les données (favoris, historique, données importées) sont stockées
uniquement dans le navigateur de l'utilisateur (LocalStorage). Rien n'est
envoyé vers un serveur externe. Pour repartir de zéro : **⚙ Paramètres →
Effacer favoris & historique**, ou effacer les données de site dans les
réglages du navigateur.

## 6. Feuille « Sécurité »

La feuille `Sécurité` du fichier source est actuellement vide et réservée à
de futurs développements (protocoles PPMS, exercices, contacts d'urgence…).
Le menu et la structure de données sont prévus pour l'accueillir facilement.


### Protection des paramètres
L'accès au menu **Paramètres** est protégé par mot de passe. Le mot de passe est demandé à la première ouverture des paramètres de chaque session du navigateur. Un bouton **Verrouiller** permet ensuite de refermer la session d'administration.


### Accès rapide mobile
Sur téléphone, une barre d’accès rapide est affichée en haut de l’application (Accueil, Écoles, Équipe, Mairies, Favoris et Réglages). Le bouton Réglages conserve la protection par mot de passe.
