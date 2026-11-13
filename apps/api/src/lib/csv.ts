export type CsvCell = string | number | boolean | null | undefined | Date;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const value = cell instanceof Date ? cell.toISOString() : String(cell);
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
