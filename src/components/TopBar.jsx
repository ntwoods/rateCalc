import { memo } from 'react';
import { APP_CONFIG } from '../constants/appConfig';

function TopBar({ statusNode, userNode }) {
  return (
    <header className="top-bar" role="banner" data-tour="portal-header">
      <div className="top-bar__brand">
        <h1 className="top-bar__title">{APP_CONFIG.APP_NAME}</h1>
        <p className="top-bar__subtitle">Internal Rate Workflow Console</p>
      </div>

      <div className="top-bar__status">{statusNode}</div>

      <div className="top-bar__user" aria-label="User area">
        {userNode}
      </div>
    </header>
  );
}

export default memo(TopBar);
