-- Applique la palette cyan, magenta, jaune, noir aux tags par défaut des tableaux existants.
-- Une valeur renommée, ou dont la couleur a été choisie librement, n'est pas modifiée.

update public.tag_values as v
set color = m.new_color
from public.tag_categories as c,
  (
    values
      ('Sizing', 'XS', '#ccffff'),
      ('Sizing', 'S', '#99ffff'),
      ('Sizing', 'M', '#4dffff'),
      ('Sizing', 'L', '#00ffff'),
      ('Sizing', 'XL', '#000000'),
      ('Statut', 'À lancer', '#cccccc'),
      ('Statut', 'En conception', '#ffff99'),
      ('Statut', 'Prêt à spec', '#ffff00'),
      ('Statut', 'Affiné', '#ff99ff'),
      ('Statut', 'En dev', '#ff00ff'),
      ('Statut', 'En prod', '#000000'),
      ('Thématique', 'Avis réglementaire', '#ff4dff'),
      ('Thématique', 'Simulateur', '#ffff4d'),
      ('Thématique', 'Admin/data', '#4d4d4d')
  ) as m (category_name, label, new_color)
where v.category_id = c.id
  and c.name = m.category_name
  and v.label = m.label
  and lower(v.color) in (
    -- Palette pastel d'origine
    '#d6d3cc', '#f2a69b', '#f5b971', '#f2d96b', '#9fd8a0', '#8fd3c8', '#9cc7f0',
    '#aab2f0', '#c9a9ee', '#f2a7c8', '#4a4a48', '#b3261e', '#2e7d32', '#1f5fae',
    -- Palette DSFR vive
    '#aea397', '#ce614a', '#e4794a', '#c8aa39', '#68a532', '#009099', '#417dc4',
    '#6a6af4', '#a558a0', '#e18b76', '#3a3a3a', '#e1000f', '#18753c', '#000091',
    -- Palette DSFR foncée
    '#6a6156', '#a94645', '#8d533e', '#716043', '#447049', '#006a6f', '#3558a2',
    '#2f4077', '#6e445a', '#755348', '#c9191e', '#297254'
  );
