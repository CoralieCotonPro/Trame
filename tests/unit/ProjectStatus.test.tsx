import { render, screen } from '@testing-library/react';
import { ProjectStatus } from '../../src/components/ProjectStatus';

test("indique que le tableau n'est pas encore disponible", () => {
  render(<ProjectStatus />);
  expect(screen.getByRole('heading', { name: 'Tableau blanc Envergo' })).toBeInTheDocument();
  expect(screen.getByText(/arrivent à l'étape 2/)).toBeInTheDocument();
});
