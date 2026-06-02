import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SearchPopover from './searchPopover.svelte';

const selectedItem = {
  label: 'Alpha',
  value: 'alpha'
};

const itemSnippet = createRawSnippet<[typeof selectedItem]>((getItem) => ({
  render: () => `<span>${getItem().label}</span>`
}));

describe('SearchPopover', () => {
  it('applies the consumer class to the real popover trigger button', () => {
    render(SearchPopover, {
      props: {
        class: 'consumer-class',
        item: itemSnippet,
        items: [selectedItem],
        value: selectedItem
      }
    });

    const trigger = screen.getByRole('combobox');

    expect(trigger.className).toContain('consumer-class');
  });

  it('forwards non-class trigger props to the real popover trigger button', () => {
    render(SearchPopover, {
      props: {
        disabled: true,
        item: itemSnippet,
        items: [selectedItem],
        value: selectedItem
      }
    });

    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });
});
