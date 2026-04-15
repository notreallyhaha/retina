import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const response = await axios.get(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        if (response.data.success) {
          setUser(response.data.user);
          setToken(storedToken);
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch {
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const register = async (firstName, lastName, email, password) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, {
      firstName,
      lastName,
      email,
      password
    });
    if (response.data.success) {
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      return { success: true, user: newUser };
    }
  };

  const login = async (email, password, firebaseToken) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email,
      password,
      firebaseToken,
      token: firebaseToken
    });
    if (response.data.success) {
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      return { success: true, user: newUser };
    }
  };

  const loginWithToken = async (firebaseToken) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      firebaseToken,
      token: firebaseToken
    });
    if (response.data.success) {
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      return { success: true, user: newUser };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await axios.post(`${API_URL}/api/auth/logout`, null, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {
      console.error('Logout error');
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  };

  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    register,
    login,
    loginWithToken,
    logout,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
