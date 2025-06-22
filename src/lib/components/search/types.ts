import type { BitsPrimitiveDivAttributes, WithChild, Without, BitsPrimitiveInputAttributes } from 'bits-ui';
import type { Snippet } from 'svelte';

// The label is searched for
// The value is used for display
export type Item = {
  label: string;
  keywords?: string[];
  value: string;
};

// -------------------- Search Root --------------------
export type SearchRootPropsWithoutHTML = WithChild<{
  items?: Item[];
  searchWith?: string;
  value: Item;
  search?: (term: string) => Promise<Item[]>;
}>;

export type SearchProps = SearchRootPropsWithoutHTML & Without<BitsPrimitiveDivAttributes, SearchRootPropsWithoutHTML>;

// -------------------- Search Input --------------------
export type SearchInputPropsWithoutHTML = WithChild<{
  value?: string;
}>;

export type SearchInputProps = SearchInputPropsWithoutHTML &
  Without<BitsPrimitiveInputAttributes, SearchInputPropsWithoutHTML>;

// -------------------- Search List --------------------
export type SearchListPropsWithoutHTML = WithChild<{
  item: Snippet<[Item]>;
}>;

export type SearchListProps = SearchListPropsWithoutHTML &
  Without<BitsPrimitiveDivAttributes, SearchListPropsWithoutHTML>;

// -------------------- Search Item --------------------
export type SearchPagnationPropsWithoutHTML = WithChild<{
  page?: number;
  perPage?: number;
}>;

export type SearchPagnationProps = SearchPagnationPropsWithoutHTML &
  Without<BitsPrimitiveDivAttributes, SearchPagnationPropsWithoutHTML>;

// -------------------- Search Empty --------------------
export type SearchEmptyPropsWithoutHTML = WithChild;

export type SearchEmptyProps = SearchEmptyPropsWithoutHTML &
  Without<BitsPrimitiveDivAttributes, SearchEmptyPropsWithoutHTML>;
