/**
 * Lightweight presentational table.
 * columns: [{ key, header, className?, align? }]
 * rows:    array of row objects
 * renderCell(row, columnKey) -> ReactNode
 */
export default function DataTable({
  columns = [],
  rows = [],
  renderCell,
  emptyMessage = "Nothing to show.",
  minWidth = 720
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-left text-sm"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 pr-4 ${col.align === "right" ? "text-right" : ""} ${
                  col.className || ""
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id || row.kycId || rowIndex}
              className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/70"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-3 pr-4 align-middle ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                >
                  {renderCell(row, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
