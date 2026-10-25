import { NavLink, Outlet } from 'react-router-dom';
import { NotificationProvider, useNotifications } from '../context/NotificationContext';
import NotificationBell from './NotificationBell';
import ToastNotification from './ToastNotification';

function LiveDot() {
  const { connected } = useNotifications();
  return (
    <span className={`live ${connected ? 'on' : 'off'}`} title={connected ? 'Live updates on' : 'Reconnecting...'}>
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

export default function MerchantLayout({ session, onSignOut }) {
  const { user, token } = session;
  return (
    <NotificationProvider userId={user.id} token={token}>
      <div className="page">
        <nav className="navbar">
          <div className="nav-left">
            <h1 className="logo">PayLink</h1>
            <NavLink to="/" end className="nav-link">Dashboard</NavLink>
            <NavLink to="/history" className="nav-link">Payment history</NavLink>
          </div>
          <div className="nav-right">
            <LiveDot />
            <NotificationBell />
            <span className="muted small hide-mobile">{user.name}</span>
            <button className="link-btn" onClick={onSignOut}>Sign out</button>
          </div>
        </nav>
        <main className="main">
          <Outlet context={{ user }} />
        </main>
        <ToastNotification />
      </div>
    </NotificationProvider>
  );
}
