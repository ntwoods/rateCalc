function RateTableHeader({ tdPercent = 20 }) {
  return (
    <thead>
      <tr>
        <th>Category</th>
        <th>Product</th>
        <th>Payment Terms</th>
        <th>Latest List Price</th>
        <th>Latest WEF</th>
        <th>Previous List Price</th>
        <th>Previous WEF</th>
        <th>{`TD (${tdPercent}%)`}</th>
        <th data-tour="special-discount-column">Special Disc %</th>
        <th>After Special Disc</th>
        <th data-tour="gst-column">GST</th>
        <th data-tour="freight-column">Freight</th>
        <th data-tour="cd-column">CD</th>
        <th>CD %</th>
        <th>Final Rate</th>
        <th data-tour="owner-row-actions">Owner Select</th>
        <th>Final Action Select</th>
        <th>History Info</th>
      </tr>
    </thead>
  );
}

export default RateTableHeader;
