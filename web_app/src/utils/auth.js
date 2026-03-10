// Token management utilities
export const getToken = () => {
  return localStorage.getItem('authToken');
};

export const setToken = (token) => {
  localStorage.setItem('authToken', token);
};

export const removeToken = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
};

export const getUser = () => {
  try {
    let user = localStorage.getItem('user');
    // debugging: log what is stored
    console.log('getUser raw value from localStorage:', user);
    if (!user) {
      return null;
    }
    // handle literal string undefined or other invalid values
    const trimmed = user.trim();
    if (trimmed === 'undefined' || trimmed === 'null' || trimmed === '') {
      return null;
    }
    // attempt parse, catch if it fails
    try {
      return JSON.parse(user);
    } catch (parseError) {
      console.error('Failed to JSON.parse user, clearing storage:', parseError, user);
      localStorage.removeItem('user');
      return null;
    }
  } catch (error) {
    console.error('Error accessing localStorage for user:', error);
    localStorage.removeItem('user');
    return null;
  }
};

export const setUser = (user) => {
  localStorage.setItem('user', JSON.stringify(user));
};

export const isTokenValid = () => {
  return !!getToken();
};

export const logout = () => {
  removeToken();
};
