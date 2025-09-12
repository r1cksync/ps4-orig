'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const AuthContext = createContext();

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check for stored token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // Fetch user data
  const fetchUser = async (authToken) => {
    if (!authToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 5000,
      });
      
      if (response.data.success) {
        setUser(response.data.data);
        localStorage.setItem('token', authToken);
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('Error fetching user:', error.response?.status, error.response?.data);
      
      if (error.response?.status === 401) {
        console.log('Token invalid or expired, logging out...');
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
      
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Register
  const register = async (email, password, name) => {
    console.log('Attempting registration with:', { email, name });
    
    try {
      const response = await axios.post(`${BASE_URL}/auth/register`, {
        email: email.toLowerCase().trim(),
        password,
        name: name?.trim() || email.split('@')[0],
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Registration response:', response.data);
      
      if (response.data && response.data.success) {
        setUser(response.data.data.user);
        setToken(response.data.data.token);
        localStorage.setItem('token', response.data.data.token);
        router.push('/dashboard');
        return { success: true };
      } else {
        console.error('Registration failed - invalid response structure:', response.data);
        return { success: false, error: response.data?.error || 'Registration failed - invalid response' };
      }
    } catch (error) {
      console.error('Registration error - full error object:', error);
      console.error('Registration error - status:', error.response?.status);
      console.error('Registration error - status text:', error.response?.statusText);
      console.error('Registration error - data:', error.response?.data);
      console.error('Registration error - message:', error.message);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return { 
          success: false, 
          error: 'Backend server is not running. Please start your backend server on port 3001.' 
        };
      }
      
      if (error.response) {
        const errorData = error.response.data;
        if (error.response.status === 400) {
          return { 
            success: false, 
            error: errorData?.error || errorData?.message || 'Invalid registration data' 
          };
        }
        if (error.response.status === 500) {
          return { 
            success: false, 
            error: 'Server error. Please try again later.' 
          };
        }
        return { 
          success: false, 
          error: errorData?.error || errorData?.message || `Registration failed (${error.response.status})` 
        };
      } else if (error.request) {
        return { 
          success: false, 
          error: 'No response from server. Please check if backend is running on http://localhost:3001' 
        };
      } else {
        return { 
          success: false, 
          error: error.message || 'Registration failed. Please try again.' 
        };
      }
    }
  };

  // Login
  const login = async (email, password) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: email.toLowerCase(),
        password,
      }, {
        timeout: 5000,
      });
      
      if (response.data.success) {
        setUser(response.data.data.user);
        setToken(response.data.data.token);
        localStorage.setItem('token', response.data.data.token);
        router.push('/dashboard');
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Login failed' 
      };
    }
  };

  // Google Login
  const googleLogin = async (idToken) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/google`, { idToken }, {
        timeout: 5000,
      });
      
      if (response.data.success) {
        setUser(response.data.data.user);
        setToken(response.data.data.token);
        localStorage.setItem('token', response.data.data.token);
        router.push('/dashboard');
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Google login failed' };
      }
    } catch (error) {
      console.error('Google login error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Google login failed' 
      };
    }
  };

  // Update Profile
  const updateProfile = async (name, avatar) => {
    if (!token) {
      return { success: false, error: 'No authentication token' };
    }

    try {
      const response = await axios.put(
        `${BASE_URL}/auth/profile`,
        { name, avatar },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        }
      );
      
      if (response.data.success) {
        setUser(response.data.data);
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Profile update failed' };
      }
    } catch (error) {
      console.error('Profile update error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Profile update failed' 
      };
    }
  };

  // Change Password
  const changePassword = async (currentPassword, newPassword) => {
    if (!token) {
      return { success: false, error: 'No authentication token' };
    }

    try {
      const response = await axios.put(
        `${BASE_URL}/auth/password`,
        { currentPassword, newPassword },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        }
      );
      
      if (response.data.success) {
        return { success: true, message: response.data.message };
      } else {
        return { success: false, error: response.data.error || 'Password change failed' };
      }
    } catch (error) {
      console.error('Password change error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Password change failed' 
      };
    }
  };

  // Update Settings
  const updateSettings = async (settings) => {
    if (!token) {
      return { success: false, error: 'No authentication token' };
    }

    try {
      const response = await axios.put(
        `${BASE_URL}/auth/settings`,
        settings,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        }
      );
      
      if (response.data.success) {
        setUser({ ...user, settings: response.data.data });
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Settings update failed' };
      }
    } catch (error) {
      console.error('Settings update error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Settings update failed' 
      };
    }
  };

  // Refresh Token
  const refreshToken = async () => {
    if (!token) {
      return { success: false, error: 'No authentication token' };
    }

    try {
      const response = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        }
      );
      
      if (response.data.success) {
        setToken(response.data.data.token);
        localStorage.setItem('token', response.data.data.token);
        return { success: true };
      } else {
        throw new Error('Refresh failed');
      }
    } catch (error) {
      console.error('Token refresh error:', error.response?.status);
      if (error.response?.status === 401) {
        logout();
      }
      return { success: false, error: error.response?.data?.error || 'Token refresh failed' };
    }
  };

  // Logout
  const logout = async () => {
    if (token) {
      try {
        await axios.post(
          `${BASE_URL}/auth/logout`,
          {},
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          }
        );
      } catch (error) {
        console.error('Logout error:', error.response?.status);
        // Continue with client-side logout even if server call fails
      }
    }
    
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    router.push('/login');
  };

  // Deactivate Account
  const deactivateAccount = async () => {
    if (!token) {
      return { success: false, error: 'No authentication token' };
    }

    try {
      const response = await axios.delete(`${BASE_URL}/auth/account`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      
      if (response.data.success) {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        router.push('/login');
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Account deactivation failed' };
      }
    } catch (error) {
      console.error('Account deactivation error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || 'Account deactivation failed' 
      };
    }
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    return !!token && !!user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        register,
        login,
        googleLogin,
        updateProfile,
        changePassword,
        updateSettings,
        refreshToken,
        logout,
        deactivateAccount,
        setUser, // Added to allow components to update user state
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};