const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Middleware to verify JWT token
const auth = (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if session exists in database
    const session = db.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Get user from database
    const user = db.getUserById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      employeeId: user.employee_id,
      faceEnrolled: user.face_enrolled
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional auth - doesn't fail if no token, but attaches user if valid token present
const optionalAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const session = db.getSessionByToken(token);
    
    if (session) {
      const user = db.getUserById(decoded.userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          employeeId: user.employee_id,
          faceEnrolled: user.face_enrolled
        };
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};

module.exports = { auth, optionalAuth, JWT_SECRET };
