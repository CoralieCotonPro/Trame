import { Lightbulb, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FEEDBACK_MAX_LENGTH, sendFeedback } from '../../services/feedbackApi';

type State = 'closed' | 'open' | 'sending' | 'sent';

/** Bouton « Une idée ? » : un message court envoyé par e-mail à l'équipe Trame. */
export function FeedbackWidget({ className, board }: { className: string; board?: string }) {
  const [state, setState] = useState<State>('closed');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state === 'open') textRef.current?.focus();
  }, [state]);

  const close = () => {
    setState('closed');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setState('sending');
    setError(null);
    try {
      await sendFeedback(message.trim(), { board });
      setMessage('');
      setState('sent');
    } catch (failure) {
      setError((failure as Error).message);
      setState('open');
    }
  };

  if (state === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setState('open')}
        className={`${className} z-20 flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium shadow-panel hover:bg-paper`}
      >
        <Lightbulb size={18} aria-hidden="true" />
        Une idée ?
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Proposer une idée"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
        // Les raccourcis du tableau ne doivent pas réagir pendant la saisie.
        event.stopPropagation();
      }}
      className={`${className} z-30 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-line bg-surface p-4 shadow-panel`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">Une idée pour améliorer Trame ?</h2>
        <button
          type="button"
          aria-label="Fermer"
          onClick={close}
          className="-mt-1 -mr-1 rounded-md p-1 text-ink-soft hover:bg-paper"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {state === 'sent' ? (
        <div className="mt-2 text-sm">
          <p role="status">Merci ! Votre message a bien été envoyé.</p>
          <button
            type="button"
            onClick={() => setState('open')}
            className="mt-3 text-ink-soft underline-offset-2 hover:underline"
          >
            Envoyer une autre idée
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-2">
          <label htmlFor="feedback-message" className="block text-sm text-ink-soft">
            Une fonctionnalité qui manque, un bug, une gêne : tout est utile.
          </label>
          <textarea
            id="feedback-message"
            ref={textRef}
            value={message}
            maxLength={FEEDBACK_MAX_LENGTH}
            rows={5}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 w-full resize-y rounded-lg border border-line p-2 text-sm"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-2 text-sm hover:bg-paper"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={state === 'sending' || !message.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {state === 'sending' ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
