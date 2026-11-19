import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getApplicationInfo } from '../bridge/application';
import { App } from './App';

vi.mock('../bridge/application', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bridge/application')>();
  return { ...actual, getApplicationInfo: vi.fn() };
});

beforeEach(() => {
  vi.mocked(getApplicationInfo).mockReset();
  vi.mocked(getApplicationInfo).mockResolvedValue({
    name: 'LingForge',
    version: '0.1.0',
    platform: 'linux',
    runtime: 'desktop',
  });
});

it('opens the lexicon project-required state and moves focus to the page heading', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Linux desktop');
  const navigation = screen.getByRole('navigation', { name: 'Workspace' });
  await user.click(within(navigation).getByRole('button', { name: 'Lexicon' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Lexicon' }),
  ).toHaveFocus();
  expect(
    within(navigation).getByRole('button', { name: 'Lexicon' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(
    screen.getByRole('heading', { name: 'Open a language project' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /save|export|add word/i }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back to overview' }));
  expect(
    screen.getByRole('heading', { level: 1, name: /Give your world a voice/ }),
  ).toHaveFocus();
});

it('keeps compact navigation accessible and applies session preferences', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Linux desktop');
  await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
  expect(
    screen.getByRole('button', { name: 'Expand sidebar' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  await user.click(screen.getByRole('radio', { name: 'Large' }));
  expect(document.documentElement).toHaveAttribute('data-text-size', 'large');
  await user.click(screen.getByRole('radio', { name: 'Reduce motion' }));
  expect(document.documentElement).toHaveAttribute('data-motion', 'reduced');
  await user.click(screen.getByRole('button', { name: 'Reset appearance' }));
  expect(document.documentElement).toHaveAttribute(
    'data-text-size',
    'standard',
  );
  expect(document.documentElement).toHaveAttribute('data-motion', 'system');
});

it('shows a retryable bridge failure instead of a false desktop-ready status', async () => {
  vi.mocked(getApplicationInfo).mockRejectedValueOnce({
    code: 'unavailable',
    message: 'Desktop unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText('Desktop unavailable.')).toBeVisible();
  expect(screen.queryByText('Linux desktop')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Linux desktop')).toBeVisible();
});
