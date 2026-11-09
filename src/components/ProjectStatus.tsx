/** Message d'attente de l'étape 1, à retirer lorsque le tableau existe (étape 2). */
export function ProjectStatus() {
  return (
    <section className="absolute top-1/2 left-1/2 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6 shadow-panel">
      <h1 className="text-xl font-bold">Tableau blanc Envergo</h1>
      <p className="mt-2 text-ink-soft">
        Le projet est initialisé. Les post-it, le texte, le déplacement et le zoom arrivent à
        l'étape 2.
      </p>
    </section>
  );
}
