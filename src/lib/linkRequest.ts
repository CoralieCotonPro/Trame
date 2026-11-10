import { useSyncStore } from '../stores/syncStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Mémorise les mots sélectionnés dans l'éditeur, puis ouvre la fenêtre de saisie du lien.
 * L'éditeur se ferme en perdant le focus : le lien s'applique ensuite au texte enregistré.
 */
export function requestLink(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const { editorFor: elementId, field } = textarea.dataset;
  if (!elementId || !field) return;
  if (start === end) {
    useSyncStore.getState().set({ notice: 'Sélectionnez d’abord les mots à transformer en lien.' });
    return;
  }
  useUiStore.getState().set({ linkRequest: { elementId, field, value, start, end } });
}
