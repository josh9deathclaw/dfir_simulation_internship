import Dashboard from "./pages/Dashboard/Dashboard";
import Scenarios from "./pages/Scenarios/Scenarios";
import Results from "./pages/Results/Results";
import Grading from "./pages/Grading/Grading";
import Account from "./pages/Account/Account";
import AdminPanel from "./pages/AdminPanel/AdminPanel";

// Define all possible routes with their role permissions
export const routes = [
  {
    path: "/dashboard",
    component: Dashboard,
    roles: ["student", "teacher", "admin"],
    title: "Dashboard"
  },
  {
    path: "/scenarios",
    component: Scenarios,
    roles: ["student", "teacher", "admin"],
    title: "Scenarios"
  },
  {
    path: "/results",
    component: Results,
    roles: ["student", "admin"],
    title: "Results"
  },
  {
    path: "/grading",
    component: Grading,
    roles: ["teacher", "admin"],
    title: "Grading"
  },
  {
    path: "/account",
    component: Account,
    roles: ["student", "teacher", "admin"],
    title: "Account"
  },
  {
    path: "/admin",
    component: AdminPanel,
    roles: ["admin"],
    title: "Admin Panel"
  }
];

// Define navigation tabs configuration
export const navigationTabs = [
  {
    key: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    icon: "📊",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "scenarios",
    path: "/scenarios",
    label: "Scenarios",
    icon: "🎯",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "results",
    path: "/results",
    label: "Results",
    icon: "📈",
    roles: ["student", "admin"]
  },
  {
    key: "grading",
    path: "/grading",
    label: "Grading",
    icon: "📝",
    roles: ["teacher", "admin"]
  },
  {
    key: "account",
    path: "/account",
    label: "Account",
    icon: "👤",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "admin",
    path: "/admin",
    label: "Admin Panel",
    icon: "⚙️",
    roles: ["admin"]
  }
];

// Helper function to get allowed routes for a role
export const getAllowedRoutes = (userRole) => {
  return routes.filter(route => route.roles.includes(userRole));
};

// Helper function to get allowed navigation tabs for a role
export const getAllowedTabs = (userRole) => {
  return navigationTabs.filter(tab => tab.roles.includes(userRole));
};

// Helper function to check if user has access to a path
export const hasAccessToPath = (userRole, path) => {
  const route = routes.find(r => r.path === path);
  return route ? route.roles.includes(userRole) : false;
};
