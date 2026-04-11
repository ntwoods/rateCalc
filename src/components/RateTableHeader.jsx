import { RATE_BASIS } from '../constants/appConfig';

function RateTableHeader({ tdPercent = 20, rateBasis = RATE_BASIS.LATEST }) {
  const showOldList = rateBasis === RATE_BASIS.OLD;

  return (
    <thead>
      <tr>
        <th>Product</th>
        <th>Payment Terms</th>
        <th>{showOldList ? 'Previous List Price' : 'Latest List Price'}</th>
        <th>{showOldList ? 'Previous WEF' : 'Latest WEF'}</th>
        <th>{`TD (${tdPercent}%)`}</th>
        <th className="col-special-disc" data-tour="special-discount-column">
          <span className="th-two-line">Special Disc<br />%</span>
        </th>
        <th>After Special Disc</th>
        <th data-tour="gst-column">GST</th>
        <th data-tour="freight-column">Freight</th>
        <th data-tour="cd-column">CD</th>
        <th className="col-cd-percent">CD %</th>
        <th>Final Rate</th>
        <th data-tour="owner-row-actions">Owner Select</th>
        <th>Party Agreed Select</th>
        <th>History Info</th>
      </tr>
    </thead>
  );
}

export default RateTableHeader;
