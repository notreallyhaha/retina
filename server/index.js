const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const faceRecognition = require('./faceRecognition');

const app = express();
const PORT = process.env.PORT || 5000;

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['*'];

// Middleware - CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (allowedOrigins.includes('*')) return callback(null, true);
    
    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
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

// Routes

// Get all employees
app.get('/api/employees', (req, res) => {
  try {
    const employees = db.getAllEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register new user with multiple face descriptors
app.post('/api/register', (req, res) => {
  try {
    const { name, email, employeeId, faceDescriptors, averageDescriptor } = req.body;
    
    if (!faceDescriptors || faceDescriptors.length === 0) {
      return res.status(400).json({ error: 'Face descriptors are required' });
    }

    // Validate we have multiple descriptors for security
    if (faceDescriptors.length < 3) {
      return res.status(400).json({ error: 'Minimum 3 face angles required for secure enrollment' });
    }

    // Check if employee ID already exists
    const existing = db.getEmployeeByEmployeeId(employeeId);
    if (existing) {
      return res.status(400).json({ error: 'Employee ID already registered' });
    }

    // Create user with multiple descriptors
    const userId = db.createUser({
      name,
      email,
      employeeId,
      faceDescriptors,
      averageDescriptor
    });

    console.log(`User registered: ${name} (${employeeId}) with ${faceDescriptors.length} descriptors`);

    res.json({ 
      success: true, 
      userId,
      message: 'Registration successful' 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clock in/out with Employee ID + Face verification
app.post('/api/clock', async (req, res) => {
  try {
    const { type, employeeId, location, faceDescriptor, proofPhoto } = req.body;
    
    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ error: 'Invalid clock type' });
    }

    if (!faceDescriptor) {
      return res.status(400).json({ error: 'Face descriptor is required' });
    }

    // First check: Verify employee ID exists
    const claimedEmployee = db.getEmployeeByEmployeeId(employeeId);
    if (claimedEmployee) {
      // If employee ID provided, verify face matches THIS specific employee
      const descriptors = claimedEmployee.faceDescriptors || [claimedEmployee.averageDescriptor];
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
          error: 'Face does not match the provided Employee ID' 
        });
      }
    }

    // Second check: Find matching employee from all registered users
    const employees = db.getAllEmployees();
    const result = faceRecognition.findMatch(faceDescriptor, employees);

    if (!result.match) {
      return res.status(401).json({ 
        error: 'Face not recognized. Please ensure you are registered in the system.' 
      });
    }

    // If employee ID was provided, verify it matches
    if (employeeId && result.match.employee_id !== employeeId) {
      return res.status(401).json({ 
        error: 'Face matches a different employee than claimed' 
      });
    }

    // Save proof photo
    let proofFilename = null;
    if (proofPhoto) {
      const base64Data = proofPhoto.replace(/^data:image\/(jpeg|jpg|png);base64,/, '');
      proofFilename = `${uuidv4()}-${result.match.employee_id}-${type}.jpg`;
      const proofPath = path.join(proofDir, proofFilename);
      fs.writeFileSync(proofPath, base64Data, 'base64');
    }

    // Create attendance record
    const recordId = db.createAttendance({
      userId: result.match.id,
      employeeId: result.match.employee_id,
      type,
      location: location ? JSON.stringify(location) : null,
      proofPhoto: proofFilename
    });

    console.log(`Clock ${type}: ${result.match.name} (${result.match.employee_id}) - Confidence: ${result.confidence}%`);

    res.json({
      success: true,
      recordId,
      employeeId: result.match.employee_id,
      name: result.match.name,
      type,
      timestamp: new Date().toISOString(),
      confidence: result.confidence,
      message: `Clock ${type} successful`
    });
  } catch (error) {
    console.error('Clock error:', error);
    res.status(500).json({ error: error.message });
  }
});

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

        // Check if employee ID already exists
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

// Delete employee
app.delete('/api/employees/:id', (req, res) => {
  try {
    db.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Face Recognition Clock System Ready!');
});
