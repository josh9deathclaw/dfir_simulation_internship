// Utility variable to represent API endpoints
export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const API = (path) => `${API_URL}/api${path}`;