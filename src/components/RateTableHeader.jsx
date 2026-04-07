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
        <th>Special Disc %</th>
        <th>After Special Disc</th>
        <th>GST</th>
        <th>Freight</th>
        <th>CD</th>
        <th>CD %</th>
        <th>Final Rate</th>
        <th>Owner Select</th>
        <th>Final Action Select</th>
        <th>History Info</th>
      </tr>
    </thead>
  );
}

export default RateTableHeader;