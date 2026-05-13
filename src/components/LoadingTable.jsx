function LoadingTable({ rows = 10 }) {
  const cells = new Array(15).fill(null);
  const lines = new Array(rows).fill(null);

  return (
    <div className="rate-table-wrap">
      <table className="rate-table rate-table--loading" aria-hidden="true">
        <thead>
          <tr>
            {cells.map((_, idx) => (
              <th key={`loading-head-${idx}`}>
                <span className="table-skeleton table-skeleton--head" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((_, rowIdx) => (
            <tr key={`loading-row-${rowIdx}`}>
              {cells.map((__, cellIdx) => (
                <td key={`loading-cell-${rowIdx}-${cellIdx}`}>
                  <span className="table-skeleton" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LoadingTable;
