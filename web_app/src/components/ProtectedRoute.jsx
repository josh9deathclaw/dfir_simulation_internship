import {Navigate, useLocation} from 'react-router-dom';
import {getToken, getUser} from '../utils/auth';
import { hasAccessToPath } from '../routes';

function ProtectedRoute({ children, requiredRoles }) {
  const token = getToken();
  const user = getUser();
  const location = useLocation();

  // Check if user is authenticated
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Check if user data exists
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If specific roles are required for this route, check them
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      // User doesn't have required role, redirect to dashboard
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Check if user has access to current path
  //if (!hasAccessToPath(user.role, location.pathname)) {
    // User doesn't have access to this path, redirect to dashboard
    //return <Navigate to="/dashboard" replace />;
 // }

  return children;
}

export default ProtectedRoute;