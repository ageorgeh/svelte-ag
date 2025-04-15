import Fuse from 'fuse.js';
import fuse, { type FuseResult, type IFuseOptions } from 'fuse.js';
import { value, type Wrap } from '../utils/args';
import { untrack } from 'svelte';

// <div use:wrapper class="typeahead">
//   <input use:input />

//   {#if suggestions.length !== 0 && showSuggestions}
//     <ol transition:slide={{ axis: 'y', duration: 100 }}>
//       {#each suggestions as suggestion, index (suggestion.item)}
//         <li animate:flip={{ delay: 0, duration: 200 }}>
//           <button use:suggestionButton={suggestion}>
//             {@html matches(suggestion)}
//           </button>
//         </li>
//       {/each}
//     </ol>
//   {/if}
// </div>

export type Args = Wrap<{
  onInput: (e: InputEvent) => void;
  searchWith?: () => string;
  initialValue: () => string;
  onStopTyping?: (value: string) => void;
  data: string[];
}>;

export class Typeahead {
  // Props
  private args: Args | null = $state(null);
  private initialValue: string = $derived(value(this.args?.initialValue));
  private data: string[] = $derived(value(this.args?.data));
  private searchWith: string = $derived(value(this.args?.searchWith));
  private onStopTyping: ((value: string) => void) | undefined = $derived(this.args?.onStopTyping);
  private debounceDelay: number = $derived(300);

  private onInput: (e: InputEvent) => void = $derived(this.args?.onInput);

  // DOM elements
  private inputE: HTMLInputElement | null = $state(null);
  private wrapperE: HTMLDivElement | null = $state(null);

  // State
  private _value = $state('');
  private debounceTimer: number | null = $state(null);

  // Fuse
  private fuse = $derived.by(() => {
    const options: IFuseOptions<string> = {
      threshold: 0.6,
      includeMatches: true
    };
    // if (keys) options.keys = keys;

    return new Fuse(this.data, options);
  });
  private _suggestions: FuseResult<string>[] = $state([]);
  private showSuggestions: boolean = $state(false);

  constructor(args: Args) {
    this.args = args;

    $effect(() => {
      if (this.data) {
        untrack(() => {
          if (this.inputE) {
            const searchResult = this.fuse.search(this.searchWith ?? this.inputE.value);
            this._suggestions = searchResult;
          }
        });
      }
    });
  }

  get elements() {
    return {
      /**
       * The input element
       */
      input: (node: HTMLInputElement) => {
        this.inputE = node;
        this.inputE.spellcheck = false;

        $effect(() => {
          this.inputE.value = this.initialValue;
          this._value = this.initialValue;
        });

        node.oninput = (e: InputEvent) => {
          this._value = this.inputE.value;
          this.onInput(e);

          const isSynthetic = (e as any).isSynthetic === true;

          const searchResult = this.fuse.search(this.searchWith ?? this.inputE.value);

          this._suggestions = searchResult;

          // Don't show suggestions if the input is synthetic (ie from a click)
          if (!isSynthetic) this.showSuggestions = true;

          if (this.onStopTyping) {
            // Clear any existing timer
            if (this.debounceTimer !== null) {
              clearTimeout(this.debounceTimer);
            }

            // Set a new timer
            this.debounceTimer = setTimeout(() => {
              if (this.onStopTyping) {
                this.onStopTyping(this._value);
              }
              this.debounceTimer = null;
            }, this.debounceDelay) as unknown as number;
          }
        };

        this.inputE.onfocus = () => {
          if (this.inputE) this._suggestions = this.fuse.search(this.inputE.value);
          this.showSuggestions = true;
        };
      },

      /**
       * The wrapper element
       */
      wrapper: (node: HTMLDivElement) => {
        this.wrapperE = node;
        this.wrapperE.addEventListener('focusout', (event: FocusEvent) => {
          const relatedTarget = event.relatedTarget;
          if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
            this.showSuggestions = false;
          }
        });
      },

      /**
       * Suggestion button
       */
      suggestionButton: (node: HTMLButtonElement, suggestion: FuseResult<string>) => {
        const selectSuggestion = () => {
          if (this.inputE) {
            this.inputE.value = suggestion.item;
            const e = new InputEvent('input', { bubbles: true, cancelable: true });
            (e as any).isSynthetic = true;
            this.inputE.dispatchEvent(e);
          }

          // Un focus so that the suggestions go away
          if (this.wrapperE) {
            this.wrapperE.blur();
            const focusableChildren = this.wrapperE.querySelectorAll('button, input, textarea, select, a, [tabindex]');
            focusableChildren.forEach((child) => child.blur());
          }
        };

        node.onmousedown = selectSuggestion.bind(this);
        node.onkeydown = (e) => {
          if (e.key === 'Enter') selectSuggestion.bind(this)();
        };
      },

      /**
       * Produces html with matches given the 'highlight' class
       */
      matches: (suggestion: FuseResult<string>) => {
        let result = '';
        let lastIndex = 0;

        const text = suggestion.item;
        const matches = suggestion.matches?.[0];

        if (!matches) return text;

        for (const [start, end] of matches.indices) {
          result += text.slice(lastIndex, start);
          result += `<span class="bg-primary/70 rounded-xs">${text.slice(start, end + 1)}</span>`;
          lastIndex = end + 1;
        }

        result += text.slice(lastIndex); // Add remaining unhighlighted part
        return result;
      }
    };
  }

  get suggestions() {
    return this._suggestions.length !== 0 && this.showSuggestions ? this._suggestions : undefined;
  }

  get value() {
    return this._value;
  }

  get input() {
    return this.inputE;
  }
}
