import type { BitsPrimitiveDivAttributes, WithChild, Without, BitsPrimitiveInputAttributes } from 'bits-ui';
import type { Snippet } from 'svelte';

export type Item = {
  label: string;
  value: string;
};

// -------------------- Search Root --------------------
export type SearchRootPropsWithoutHTML = WithChild<{
  items: Item[];
  searchWith?: string;
  value?: string;
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
}>;

export type SearchPagnationProps = SearchPagnationPropsWithoutHTML &
  Without<BitsPrimitiveDivAttributes, SearchPagnationPropsWithoutHTML>;

// -------------------- Search Empty --------------------
export type SearchEmptyPropsWithoutHTML = WithChild;

export type SearchEmptyProps = SearchEmptyPropsWithoutHTML &
  Without<BitsPrimitiveDivAttributes, SearchEmptyPropsWithoutHTML>;
