import {Navigate} from 'react-router-dom';
import {getToken} from '../utils/auth';

function ProtectedRoute({ children }) {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" />;
  }

  return children;
}

export default ProtectedRoute;