export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Lays items out in rows for a grid of `columns` columns. A wide item takes a whole row to itself.
 * Each row is the list of item indexes in it, left to right.
 */
export function gridRows(wide: readonly boolean[], columns: number): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  wide.forEach((isWide, index) => {
    if (isWide) {
      if (row.length > 0) rows.push(row);
      rows.push([index]);
      row = [];
      return;
    }
    row.push(index);
    if (row.length === columns) {
      rows.push(row);
      row = [];
    }
  });
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * Which item the d-pad moves to from `index` in a grid. Left and right stay in the row and stop at its ends.
 * Up and down go to the row above or below, to the item nearest the same column (a wide item counts as
 * every column), and wrap from the last row to the first.
 */
export function gridMove(wide: readonly boolean[], columns: number, index: number, direction: Direction): number {
  const rows = gridRows(wide, columns);
  const r = rows.findIndex((row) => row.includes(index));
  if (r === -1) return index;
  const row = rows[r] as number[];
  const c = row.indexOf(index);
  if (direction === 'left') return row[Math.max(0, c - 1)] as number;
  if (direction === 'right') return row[Math.min(row.length - 1, c + 1)] as number;
  const target = rows[(r + (direction === 'down' ? 1 : -1) + rows.length) % rows.length] as number[];
  return target[Math.min(c, target.length - 1)] as number;
}
