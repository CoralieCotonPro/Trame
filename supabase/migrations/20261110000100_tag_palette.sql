-- Applique la palette définitive aux tags par défaut des tableaux existants.
-- Une valeur renommée par vos soins, ou dont la couleur a été choisie librement, n'est pas modifiée.

-- « Prêt à spec » devient « À rédiger », sauf si ce libellé existe déjà dans la catégorie.
update public.tag_values as v
set label = 'À rédiger'
from public.tag_categories as c
where v.category_id = c.id
  and c.name = 'Statut'
  and v.label = 'Prêt à spec'
  and not exists (
    select 1 from public.tag_values as other
    where other.category_id = v.category_id and lower(other.label) = lower('À rédiger')
  );

update public.tag_values as v
set color = m.new_color
from public.tag_categories as c,
  (
    values
      ('Sizing', 'XS', '#ececfe'),
      ('Sizing', 'S', '#e3e3fd'),
      ('Sizing', 'M', '#cacafb'),
      ('Sizing', 'L', '#6a6af4'),
      ('Sizing', 'XL', '#000091'),
      ('Statut', 'À lancer', '#cecece'),
      ('Statut', 'En conception', '#ffe552'),
      ('Statut', 'À rédiger', '#ff732c'),
      ('Statut', 'Affiné', '#b6cffb'),
      ('Statut', 'En dev', '#60e0eb'),
      ('Statut', 'En prod', '#95e257'),
      ('Thématique', 'Avis réglementaire', '#6a6af4'),
      ('Thématique', 'Simulateur', '#f774ef'),
      ('Thématique', 'Admin/data', '#b3afb2')
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
    '#2f4077', '#6e445a', '#755348', '#c9191e', '#297254',
    -- Palette cyan, magenta, jaune, noir (provisoire)
    '#00ffff', '#4dffff', '#99ffff', '#ccffff', '#ff00ff', '#ff4dff', '#ff99ff', '#ffccff',
    '#ffff00', '#ffff4d', '#ffff99', '#ffffcc', '#000000', '#4d4d4d', '#999999', '#cccccc'
  );
