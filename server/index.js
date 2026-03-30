const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');
const faceRecognition = require('./faceRecognition');
const { auth, optionalAuth, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

// Middleware - CORS configuration
// Handle preflight OPTIONS requests first
app.options('*', cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
const proofDir = path.join(uploadsDir, 'proof');

[uploadsDir, proofDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Password validation helper
const validatePassword = (password) => {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return { valid: errors.length === 0, errors };
};

// ==================== AUTH ROUTES ====================

// Register - Create account with email/password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        details: passwordValidation.errors 
      });
    }

    // Check if email already exists
    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (without face descriptors yet)
    const userId = db.createUser({
      name,
      email,
      password: hashedPassword,
      faceDescriptors: null,
      averageDescriptor: null
    });

    // Generate JWT token
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '30d' });

    // Store session
    db.createSession({ userId, token });

    console.log(`User registered: ${name} (${email})`);

    res.json({
      success: true,
      token,
      user: {
        id: userId,
        name,
        email,
        faceEnrolled: false
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login - Authenticate with email/password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    // Store session (replaces any existing session)
    db.createSession({ userId: user.id, token });

    console.log(`User logged in: ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        employeeId: user.employee_id,
        faceEnrolled: user.face_enrolled
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logout - Invalidate session
app.post('/api/auth/logout', auth, (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      db.deleteSession(token);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', auth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ==================== FACE ENROLLMENT ROUTES ====================

// Complete face enrollment (requires auth)
app.post('/api/register/face', auth, async (req, res) => {
  try {
    const { faceDescriptors, averageDescriptor } = req.body;

    if (!faceDescriptors || faceDescriptors.length === 0) {
      return res.status(400).json({ error: 'Face descriptors are required' });
    }

    // Validate we have multiple descriptors for security
    if (faceDescriptors.length < 3) {
      return res.status(400).json({ error: 'Minimum 3 face angles required for secure enrollment' });
    }

    // Generate employee ID from user ID
    const employeeId = `EMP${String(req.user.id).padStart(5, '0')}`;

    // Update user with face descriptors
    db.updateUser(req.user.id, {
      employee_id: employeeId,
      faceDescriptors,
      averageDescriptor,
      face_enrolled: true
    });

    console.log(`Face enrolled for user: ${req.user.name} (${employeeId}) with ${faceDescriptors.length} descriptors`);

    res.json({
      success: true,
      employeeId,
      message: 'Face enrollment successful'
    });
  } catch (error) {
    console.error('Face enrollment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CLOCK IN/OUT ROUTES ====================

// Clock in/out (requires authentication)
app.post('/api/clock', auth, async (req, res) => {
  try {
    const { type, location, faceDescriptor, proofPhoto } = req.body;

    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ error: 'Invalid clock type' });
    }

    if (!faceDescriptor) {
      return res.status(400).json({ error: 'Face descriptor is required' });
    }

    // Verify user has completed face enrollment
    if (!req.user.faceEnrolled) {
      return res.status(400).json({ error: 'Please complete face enrollment first' });
    }

    // Get the authenticated user's face descriptors
    const user = db.getUserById(req.user.id);
    const descriptors = user.faceDescriptors || [user.averageDescriptor];
    
    // Verify face matches the authenticated user
    let matchFound = false;
    for (const storedDesc of descriptors) {
      const verification = faceRecognition.verifyIdentity(faceDescriptor, storedDesc, 0.5);
      if (verification.isMatch) {
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      return res.status(401).json({
        error: 'Face does not match your registered profile'
      });
    }

    // Save proof photo
    let proofFilename = null;
    if (proofPhoto) {
      const base64Data = proofPhoto.replace(/^data:image\/(jpeg|jpg|png);base64,/, '');
      proofFilename = `${uuidv4()}-${req.user.employeeId}-${type}.jpg`;
      const proofPath = path.join(proofDir, proofFilename);
      fs.writeFileSync(proofPath, base64Data, 'base64');
    }

    // Create attendance record
    const recordId = db.createAttendance({
      userId: req.user.id,
      employeeId: req.user.employeeId,
      type,
      location: location ? JSON.stringify(location) : null,
      proofPhoto: proofFilename
    });

    console.log(`Clock ${type}: ${req.user.name} (${req.user.employeeId})`);

    res.json({
      success: true,
      recordId,
      employeeId: req.user.employeeId,
      name: req.user.name,
      type,
      timestamp: new Date().toISOString(),
      message: `Clock ${type} successful`
    });
  } catch (error) {
    console.error('Clock error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMPLOYEE ROUTES ====================

// Get all employees
app.get('/api/employees', (req, res) => {
  try {
    const employees = db.getAllEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete employee
app.delete('/api/employees/:id', (req, res) => {
  try {
    db.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ATTENDANCE ROUTES ====================

// Get attendance records
app.get('/api/records', (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;
    const records = db.getAttendanceRecords({ employeeId, startDate, endDate });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Bulk upload employees (admin)
app.post('/api/admin/bulk-upload', async (req, res) => {
  try {
    const employees = req.body.employees || [];
    const results = [];

    for (const employee of employees) {
      try {
        if (!employee.faceDescriptors || employee.faceDescriptors.length === 0) {
          results.push({ employeeId: employee.employeeId, success: false, error: 'No face descriptors' });
          continue;
        }

        const existing = db.getEmployeeByEmployeeId(employee.employeeId);
        if (existing) {
          results.push({ employeeId: employee.employeeId, success: false, error: 'Already registered' });
          continue;
        }

        const avgDescriptor = employee.faceDescriptors.length > 0
          ? employee.faceDescriptors.reduce((a, b) => a.map((v, i) => v + b[i]).map(v => v / employee.faceDescriptors.length))
          : employee.faceDescriptors[0];

        const userId = db.createUser({
          name: employee.name,
          email: employee.email || '',
          employeeId: employee.employeeId,
          faceDescriptors: employee.faceDescriptors,
          averageDescriptor: avgDescriptor
        });
        results.push({ employeeId: employee.employeeId, success: true, userId });
      } catch (error) {
        results.push({ employeeId: employee.employeeId, success: false, error: error.message });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Face Recognition Clock System Ready!');
});
