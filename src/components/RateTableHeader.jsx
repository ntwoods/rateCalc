import { RATE_BASIS } from '../constants/appConfig';

function RateTableHeader({ tdPercent = 20, rateBasis = RATE_BASIS.LATEST }) {
  const showOldList = rateBasis === RATE_BASIS.OLD;

  return (
    <thead>
      <tr>
        <th className="col-product">Product</th>
        <th className="col-payment-terms">
          <span className="th-two-line">Payment<br />Terms</span>
        </th>
        <th className="col-list-price">
          {showOldList ? 'Previous List Price' : 'Latest List Price'}
        </th>
        <th className="col-wef">{showOldList ? 'Previous WEF' : 'Latest WEF'}</th>
        <th className="col-td-rate">{`TD (${tdPercent}%)`}</th>
        <th className="col-special-disc" data-tour="special-discount-column">
          <span className="th-two-line">Special Disc<br />%</span>
        </th>
        <th className="col-after-special">
          <span className="th-two-line">After Special<br />Disc</span>
        </th>
        <th className="col-gst" data-tour="gst-column">Other Charges</th>
        <th className="col-freight" data-tour="freight-column">Freight</th>
        <th className="col-cd-mode" data-tour="cd-column">CD</th>
        <th className="col-cd-percent">CD %</th>
        <th className="col-final-rate">Final Rate</th>
        <th className="col-net-rates">NET RATES</th>
        <th className="col-owner-select" data-tour="owner-row-actions">
          <span className="th-two-line">Owner<br />Select</span>
        </th>
        <th className="col-history-info">
          <span className="th-two-line">History<br />Info</span>
        </th>
      </tr>
    </thead>
  );
}

export default RateTableHeader;
