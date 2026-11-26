-- Autorise les losanges (diagrammes de décision), en plus des post-it, textes et traits.
-- Les flèches accrochées aux éléments restent des traits : l'accroche est décrite dans `style`.

alter table public.elements drop constraint elements_type_check;
alter table public.elements
  add constraint elements_type_check check (type in ('postit', 'text', 'line', 'diamond'));
