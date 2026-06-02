import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import SearchPassthroughHarness from './SearchPassthroughHarness.svelte';

const items = [
  { label: 'Alpha', value: 'alpha' },
  { label: 'Beta', value: 'beta' }
];

describe('Search passthrough props', () => {
  it('forwards root class and data attributes', () => {
    render(SearchPassthroughHarness, {
      props: {
        items,
        value: items[0],
        rootClass: 'root-class',
        rootTestId: 'search-root'
      }
    });

    const root = screen.getByTestId('search-root');

    expect(root.className).toContain('root-class');
    expect(root.getAttribute('data-search-root')).toBe('');
  });

  it('forwards input class and aria attributes', () => {
    render(SearchPassthroughHarness, {
      props: {
        items,
        value: items[0],
        inputClass: 'input-class',
        inputLabel: 'Filter items',
        inputTestId: 'search-input'
      }
    });

    const input = screen.getByTestId('search-input');

    expect(input.className).toContain('input-class');
    expect(input.getAttribute('aria-label')).toBe('Filter items');
    expect(input.getAttribute('data-search-input')).toBe('');
  });

  it('forwards list class and data attributes to the list container', () => {
    render(SearchPassthroughHarness, {
      props: {
        items,
        value: items[0],
        listClass: 'list-class',
        listTestId: 'search-list'
      }
    });

    const list = screen.getByTestId('search-list');
    const itemButton = screen.getByRole('button', { name: 'Alpha' });

    expect(list.className).toContain('list-class');
    expect(list.getAttribute('data-search-list')).toBe('');
    expect(itemButton.className).not.toContain('list-class');
  });

  it('forwards pagination class and data attributes to the pagination root', () => {
    render(SearchPassthroughHarness, {
      props: {
        items,
        value: items[0],
        paginationClass: 'pagination-class',
        paginationTestId: 'search-pagination'
      }
    });

    const pagination = screen.getByTestId('search-pagination');

    expect(pagination.className).toContain('pagination-class');
    expect(pagination.getAttribute('data-search-item')).toBe('');
  });
});
