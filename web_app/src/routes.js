import Dashboard from "./pages/Dashboard/Dashboard";
import Scenarios from "./pages/Scenarios/Scenarios";
import CreateScenario from "./pages/CreateScenario/CreateScenario";
import Results from "./pages/Results/Results";
import Grading from "./pages/Grading/Grading";
import Account from "./pages/Account/Account";
import AdminPanel from "./pages/AdminPanel/AdminPanel";
import Classes from "./pages/Classes/Classes";
import SimulatorPage from "./pages/SimulatorPage/SimulatorPage";
import EditScenario from "./pages/EditScenario/EditScenario";

// Define all possible routes with their role permissions
export const routes = [
  {
    path: "/dashboard",
    component: Dashboard,
    roles: ["student", "teacher", "admin"],
    title: "Dashboard"
  },
  {
    path: "/classes",
    component: Classes,
    roles: ["teacher", "admin"],
    title: "Classes"
  },
  {
    path: "/scenarios",
    component: Scenarios,
    roles: ["student", "teacher", "admin"],
    title: "Scenarios"
  },
  {
    path: "/create-scenario",
    component: CreateScenario,
    roles: ["teacher", "admin"],
    title: "Create Scenario"
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
  },
  {
    path: "/simulatorpage/:scenarioId",
    component: SimulatorPage,
    roles: ["student", "teacher", "admin"],
    title: "Scenario Simulator"
  },
  {
    path: "/edit-scenario/:scenarioId",
    component: EditScenario,
    roles: ["teacher", "admin"],
    title: "Edit Scenario"
  },
];

// Define navigation tabs configuration
export const navigationTabs = [
  {
    key: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "classes",
    path: "/classes",
    label: "Classes",
    roles: ["teacher", "admin"]
  },
  {
    key: "scenarios",
    path: "/scenarios",
    label: "Scenarios",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "results",
    path: "/results",
    label: "Results",
    roles: ["student"]
  },
  {
    key: "grading",
    path: "/grading",
    label: "Grading",
    roles: ["teacher"]
  },
  {
    key: "account",
    path: "/account",
    label: "Account",
    roles: ["student", "teacher", "admin"]
  },
  {
    key: "admin",
    path: "/admin",
    label: "Admin Panel",
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
