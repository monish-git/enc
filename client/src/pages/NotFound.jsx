import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="m-auto">
      <Empty icon="warn" title="ERROR 404 - FILE NOT FOUND">
        The page you asked for does not exist.
        <div className="mt-2">
          <Link to="/inbox" className="btn">
            GO TO INBOX
          </Link>
        </div>
      </Empty>
    </div>
  );
}
