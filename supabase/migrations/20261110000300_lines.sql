-- Autorise les traits, en plus des post-it et des textes.
-- Un trait se décrit par son rectangle englobant (x, y, width, height) et son coin de départ (style.start).

alter table public.elements drop constraint elements_type_check;
alter table public.elements
  add constraint elements_type_check check (type in ('postit', 'text', 'line'));
