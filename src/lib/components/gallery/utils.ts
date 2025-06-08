export type Size = 'S' | 'M' | 'L';

const w = { S: 1, M: 1, L: 2 };
const h = { S: 1, M: 2, L: 3 };

function imageSize(size: Size) {
  return [w[size], h[size]];
}

/**
 * Gets the style statement for a particular size
 */
export function styleForSize(size: Size) {
  return `grid-column: span ${imageSize(size)[0]}; grid-row: span ${imageSize(size)[1]};`;
}

/**
 * Packs images of different sizes into a grid layout
 * @param small Array of small-sized items to place in grid
 * @param medium Array of medium-sized items to place in grid
 * @param large Array of large-sized items to place in grid
 * @param cols Number of columns in the grid
 * @returns Array of items arranged in optimal grid order
 */
export function packGrid<Item extends { size: Size }>(small: Item[], medium: Item[], large: Item[], cols = 4): Item[] {
  const result: Item[] = [];
  // Create a 2D grid to track occupied cells (32 rows max, adjustable column width)
  const occ: boolean[][] = Array.from({ length: 32 }, () => Array(cols).fill(false));

  let r = 0, // Current row
    c = 0, // Current column
    lastSize: Size | null = null; // Track last placed item size for variety

  // Check if we still have any items to place
  const hasStock = () => small.length || medium.length || large.length;

  // Organize items by size for easy access
  const pool = { S: small, M: medium, L: large } as const;

  // Dynamic preference ordering strategy for visual variety
  // After placing one size, prefer different sizes next for better distribution
  const pref = (prev: Size | null): Size[] => {
    if (prev === 'L') return ['S', 'M', 'L']; // After large, prefer small
    if (prev === 'S') return ['L', 'M', 'S']; // After small, prefer large
    if (prev === 'M') return ['S', 'L', 'M']; // After medium, prefer small
    return ['L', 'M', 'S']; // Initial preference (start with large items)
  };

  while (hasStock()) {
    // Skip already occupied cells
    while (occ[r]?.[c]) {
      // Move to next row if end of column reached
      if (++c === cols) {
        c = 0;
        r++;
      }
    }

    // Check if item of given size can fit at current position
    const fits = (size: Size) => {
      // Check if item would extend beyond right edge
      if (c + w[size] > cols) return false;
      // Check if all required cells are unoccupied
      for (let y = 0; y < h[size]; y++) for (let x = 0; x < w[size]; x++) if (occ[r + y]?.[c + x]) return false;
      return true;
    };

    let chosen: Item | undefined;

    // Try to place items in preferred size order
    for (const sz of pref(lastSize)) {
      if (pool[sz].length && fits(sz)) {
        chosen = pool[sz].shift()!;
        break;
      }
    }

    if (!chosen) {
      // If no item fits at current position, move to next cell
      if (++c === cols) {
        c = 0;
        r++;
      }
      continue;
    }

    // Mark grid cells as occupied based on item dimensions
    const sx = w[chosen.size],
      sy = h[chosen.size];
    for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) occ[r + y][c + x] = true;

    result.push(chosen);
    lastSize = chosen.size; // Remember this size for next preference calculation
    c += sx; // Move cursor past the placed item
    // Move to next row if needed
    if (c === cols) {
      c = 0;
      r++;
    }
  }

  return result;
}
