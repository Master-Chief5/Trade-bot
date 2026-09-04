import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

export function Welcome() {
  return (
    <div className="signin">
      <div className="row" style={{ color: 'var(--duty)' }}>
        <Icon name="dorm" size={30} />
        <div>
          <h1 style={{ fontSize: 28 }}>Room Check</h1>
          <div className="muted small">For the RAs and deans of the residence</div>
        </div>
      </div>
      <p className="muted">Everything about the boys is encrypted on your phone before it leaves it. The deans decide who gets in.</p>
      <div className="stack">
        <Button size="lg" to="/account?mode=signup">Create an account</Button>
        <Button size="lg" variant="outline" to="/account">Sign in</Button>
      </div>
      <p className="muted small">
        No account and no internet? <Link to="/setup">Set up on this device only.</Link>
      </p>
    </div>
  );
}
