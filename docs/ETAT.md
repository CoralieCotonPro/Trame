# État des fonctionnalités

« Testé » signifie couvert par un test automatisé, exécuté sur une vraie base Supabase locale. Aucune réponse du serveur n'est simulée dans ces tests.

| Fonctionnalité | Implémentée | Testée | État |
| --- | :-: | :-: | --- |
| Tableau infini, grille optionnelle | Oui | Oui | Fonctionne |
| Zoom centré sur le curseur (10 % à 400 %), boutons, ajustement | Oui | Oui | Fonctionne |
| Déplacement du tableau (Espace, Main, trackpad) | Oui | Oui | Fonctionne |
| Sélection, multiple, rectangulaire, déplacement groupé | Oui | Oui | Fonctionne |
| Redimensionnement, ordre, duplication, copier-coller, suppression | Oui | Oui | Fonctionne |
| Annuler / rétablir, sans effacer le travail des autres | Oui | Oui | Fonctionne |
| Texte libre T1, T2, T3, normal, petit ; couleur, alignement, largeur | Oui | Oui | Fonctionne |
| Post-it : 6 couleurs, texte, tailles, pas de contenu coupé | Oui | Oui | Fonctionne |
| Catégories et valeurs de tags personnalisables | Oui | Oui | Fonctionne |
| Tags sur post-it, propagation des libellés et couleurs | Oui | Oui | Fonctionne |
| Filtres combinés | Oui | Oui | Fonctionne |
| Connexion du propriétaire par mot de passe, lien e-mail en secours | Oui | Oui | En ligne |
| Création, liste et suppression de tableaux | Oui | Oui | Fonctionne |
| Sauvegarde automatique et indicateur fiable | Oui | Oui | Fonctionne |
| Modifications conservées hors connexion, nouvelles tentatives | Oui | Oui | Fonctionne |
| Temps réel entre navigateurs | Oui | Oui | Fonctionne en local |
| Participants, curseurs, disparition à la déconnexion | Oui | Oui | Fonctionne en local |
| Aperçu des déplacements en direct | Oui | Oui | Fonctionne en local |
| Conflits : édition signalée, aucun texte perdu | Oui | Oui | Fonctionne (pas de fusion automatique) |
| Reconnexion et rattrapage | Oui | Oui | Fonctionne en local |
| Liens de partage édition / lecture, expiration, révocation | Oui | Oui | Fonctionne en local |
| Invités sans compte | Oui | Oui | Fonctionne en local |
| Droits appliqués par la base, y compris sur le temps réel | Oui | Oui | Vérifié par des tentatives de contournement |
| Export JSON versionné, import validé avec confirmation | Oui | Oui | Fonctionne |
| Export PNG cadré, éléments hors écran compris | Oui | Oui | Fonctionne |
| Accessibilité : clavier, libellés, contrastes | Partielle | Partielle | Voir les limites |
| Déploiement Netlify | Oui | Manuellement | En ligne : https://trame-envergo.netlify.app |

## Performance

Mesurée sur le build de production avec 300 post-it taggés et 100 textes, dans Chromium sans carte graphique : 60 images/s en déplacement du tableau, au zoom et en glissant un post-it ; chargement du tableau en 0,3 s en local. À confirmer sur vos propres machines et avec le réseau réel.

Avec 10 participants bougeant tous en même temps : 75 messages/s (limite gratuite : 100).

## Limites connues

- **Vérifications en ligne :** les tests automatisés tournent contre Supabase en local. La version en ligne a été contrôlée manuellement.
- **Texte simultané :** pas de fusion caractère par caractère. Le second texte validé est placé dans un post-it copie, à réconcilier à la main.
- **Suppression pendant une édition :** si un élément est supprimé pendant qu'une autre personne le modifie, la suppression gagne et le texte en cours est perdu. Un message la prévient.
- **Annulation :** elle ne couvre pas la suppression d'un tag du catalogue, ni un import, qui demandent une confirmation.
- **Invités :** une session anonyme est liée au navigateur. Après avoir vidé ses données de navigation, un invité doit rouvrir un lien valide. Aucune protection anti-robots (CAPTCHA) n'est en place : seule la limite par adresse IP protège la création de sessions.
- **Accessibilité :** les éléments du canvas sont atteignables au clavier et lisibles par lecteur d'écran via une liste dédiée, mais l'application n'a pas été auditée avec de vrais lecteurs d'écran.
- **Curseurs à 10 participants :** environ une mise à jour par seconde, pour rester dans la limite gratuite.
- **Tablettes :** hors périmètre, à votre demande.
- **Tests navigateur :** réalisés sous Chromium uniquement.
