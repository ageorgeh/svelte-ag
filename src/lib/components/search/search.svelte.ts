import { useRefById, type ReadableBoxedValues, type WithRefProps, type WritableBoxedValues } from 'svelte-toolbelt';
import { Context, watch } from 'runed';
import { computeCommandScore } from 'bits-ui';
import type { Item } from './types';
import { dequal } from 'dequal';

const SEARCH_ROOT_ATTR = 'data-search-root';
const SEARCH_INPUT_ATTR = 'data-search-input';
const SEARCH_LIST_ATTR = 'data-search-list';
const SEARCH_ITEM_ATTR = 'data-search-item';
const SEARCH_EMPTY_ATTR = 'data-search-empty';

// -------------------- Search Root --------------------
export type SearchRootStateProps = WithRefProps<
  ReadableBoxedValues<{
    items: Item[];
    searchWith?: string;
    search?: (term: string) => Promise<Item[]>;
  }> &
    WritableBoxedValues<{
      value: Item;
    }>
>;

export class SearchRootState {
  // State
  searchState = $state({
    value: '',
    sortedList: [] as (Item & { score?: number })[],
    showSuggestions: false
  });
  numPerPage = $state(0);
  start = $state(0);
  end = $state(0);

  loading = $state(false);
  inputRef = $state<HTMLInputElement | null>(null);
  debounceTimer: number | null = $state(null);

  constructor(readonly opts: SearchRootStateProps) {
    useRefById(opts);

    if (opts.items !== null) {
      // Watch for changes in items and update the sorted list
      watch(
        () => this.opts.items.current,
        (newItems, oldItems) => {
          if (!dequal(newItems, oldItems)) {
            this.search();
          }
        }
      );
    }

    // Move to the start of the list whenever it changes
    watch(
      () => this.searchState.sortedList,
      () => {
        this.start = 0;
      }
    );

    watch([() => this.searchState.sortedList, () => this.numPerPage, () => this.start], () => {
      const filteredList = this.getFilteredList();
      this.end = this.numPerPage === 0 ? 0 : Math.min(filteredList.length, this.start + this.numPerPage);
    });

    this.search();
    this.searchState.value = this.opts.value.current.value;
  }

  /**
   * This function needs to update the sorted list of items based on the search term.
   */
  async search() {
    const searchTerm = this.opts.searchWith?.current ?? this.searchState.value;

    // Uses the custom search function if provided
    if (this.opts.search !== undefined) {
      const func = this.opts.search.current;
      if (func) {
        this.searchState.sortedList = await func(searchTerm);
        return;
      }
    }

    // Use the default search algo
    const scoredItems = this.opts.items.current.map((item) => ({
      ...item,
      score: searchTerm ? computeCommandScore(item.label, searchTerm, item.keywords) : 1
    }));

    // Sort items by score (highest first) then alphabetically
    const newSortedList = scoredItems.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });

    if (!dequal(this.searchState.sortedList, newSortedList)) {
      this.searchState.sortedList = newSortedList;
    }
  }

  getFilteredList() {
    return this.searchState.sortedList.filter((item) => item.score === undefined || item.score > 0);
  }

  props = $derived.by(
    () =>
      ({
        id: this.opts.id.current,
        [SEARCH_ROOT_ATTR]: ''
      }) as const
  );
}

const SearchRootContext = new Context<SearchRootState>('Search.Root');

// -------------------- Search Input --------------------
export type SearchInputStateProps = WithRefProps<
  WritableBoxedValues<{
    value: string;
  }>
>;
export class SearchInputState {
  constructor(
    readonly opts: SearchInputStateProps,
    readonly root: SearchRootState
  ) {
    useRefById({
      ...opts,
      onRefChange: (node) => {
        if (node instanceof HTMLInputElement) {
          this.root.inputRef = node;
        }
      }
    });

    /**
     * This is essentially our oninput handler
     * Sets the value of the search state with the new value
     * Searches the list with that value
     * Shows suggestions
     */
    watch(
      () => this.opts.value.current,
      () => {
        this.root.searchState.value = this.opts.value.current;
        this.root.search();
        this.root.searchState.showSuggestions = true;
      }
    );
  }

  // Searches on focus
  onFocus = () => {
    this.root.search();
  };

  props = $derived.by(
    () =>
      ({
        id: this.opts.id.current,
        onfocus: this.onFocus,
        [SEARCH_INPUT_ATTR]: ''
      }) as const
  );
}

// -------------------- Search List --------------------
export type SearchListStateProps = WithRefProps;
export class SearchListState {
  constructor(
    readonly opts: SearchListStateProps,
    readonly root: SearchRootState
  ) {
    useRefById(opts);
  }

  props = $derived.by(
    () =>
      ({
        id: this.opts.id.current,
        [SEARCH_LIST_ATTR]: ''
      }) as const
  );

  get suggestions() {
    return this.root.searchState.sortedList;
  }

  visible(item: Item & { score?: number }) {
    // Check if item has a score of 0
    if (item.score === 0) return false;

    return this.root
      .getFilteredList()
      .slice(this.root.start, this.root.end)
      .some((i) => dequal({ label: i.label, value: i.value }, { label: item.label, value: item.value }));
  }

  selected(item: Item) {
    return this.root.opts.value.current.value === item.value;
  }
  select(item: Item) {
    this.root.opts.value.current = item;
    this.root.searchState.showSuggestions = false;
    this.root.inputRef?.focus();
  }
}

// -------------------- Search Item --------------------
export type SearchPagnationStateProps = WithRefProps<
  WritableBoxedValues<{
    page: number;
    perPage: number;
  }>
>;
export class SearchPagnationState {
  constructor(
    readonly opts: SearchPagnationStateProps,
    readonly root: SearchRootState
  ) {
    useRefById(opts);
    this.root.numPerPage = this.opts.perPage.current;

    watch(
      () => this.opts.perPage.current,
      (perPage) => {
        this.root.numPerPage = perPage;
      }
    );

    watch(
      () => this.opts.page.current,
      (page) => {
        this.root.start = (page - 1) * this.root.numPerPage;
      }
    );
  }

  props = $derived.by(
    () =>
      ({
        id: this.opts.id.current,
        [SEARCH_ITEM_ATTR]: ''
      }) as const
  );

  get length() {
    return this.root.getFilteredList().length;
  }

  get perPage() {
    return this.opts.perPage.current;
  }

  get activeItems() {
    return this.root.getFilteredList().slice(this.root.start, this.root.end);
  }
}

// -------------------- Search Empty --------------------
export type SearchEmptyStateProps = WithRefProps;
export class SearchEmptyState {
  constructor(
    readonly opts: SearchEmptyStateProps,
    readonly root: SearchRootState
  ) {
    useRefById(opts);
  }
  props = $derived.by(
    () =>
      ({
        id: this.opts.id.current,
        [SEARCH_EMPTY_ATTR]: ''
      }) as const
  );
}

// -------------------- Search Hooks --------------------
export function useSearchRoot(props: SearchRootStateProps) {
  return SearchRootContext.set(new SearchRootState(props));
}
export function useSearchInput(props: SearchInputStateProps) {
  return new SearchInputState(props, SearchRootContext.get());
}
export function useSearchList(props: SearchListStateProps) {
  return new SearchListState(props, SearchRootContext.get());
}
export function useSearchPagnation(props: SearchPagnationStateProps) {
  return new SearchPagnationState(props, SearchRootContext.get());
}
export function useSearchEmpty(props: SearchEmptyStateProps) {
  return new SearchEmptyState(props, SearchRootContext.get());
}
