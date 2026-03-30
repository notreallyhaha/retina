const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading database:', error);
  }
  return { users: [], attendance: [], sessions: [] };
}

function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

module.exports = {
  createUser({ name, email, password, faceDescriptors, averageDescriptor }) {
    const db = loadDB();
    const id = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1;

    db.users.push({
      id,
      name,
      email,
      password, // Hashed password
      employee_id: null, // Will be set after face enrollment
      face_descriptors: faceDescriptors ? JSON.stringify(faceDescriptors) : null,
      average_descriptor: averageDescriptor ? JSON.stringify(averageDescriptor) : null,
      face_enrolled: false,
      created_at: new Date().toISOString()
    });

    saveDB(db);
    return id;
  },

  updateUser(id, updates) {
    const db = loadDB();
    const userIndex = db.users.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
      return null;
    }

    db.users[userIndex] = { ...db.users[userIndex], ...updates };
    
    if (updates.faceDescriptors) {
      db.users[userIndex].face_descriptors = JSON.stringify(updates.faceDescriptors);
    }
    if (updates.averageDescriptor) {
      db.users[userIndex].average_descriptor = JSON.stringify(updates.averageDescriptor);
    }

    saveDB(db);
    return db.users[userIndex];
  },

  findUserByEmail(email) {
    const db = loadDB();
    const user = db.users.find(u => u.email === email);
    if (user) {
      return {
        ...user,
        faceDescriptors: user.face_descriptors ? JSON.parse(user.face_descriptors) : null,
        averageDescriptor: user.average_descriptor ? JSON.parse(user.average_descriptor) : null
      };
    }
    return null;
  },

  getUserById(id) {
    const db = loadDB();
    const user = db.users.find(u => u.id === id);
    if (user) {
      return {
        ...user,
        faceDescriptors: user.face_descriptors ? JSON.parse(user.face_descriptors) : null,
        averageDescriptor: user.average_descriptor ? JSON.parse(user.average_descriptor) : null
      };
    }
    return null;
  },

  getAllEmployees() {
    const db = loadDB();
    return db.users
      .filter(u => u.face_enrolled) // Only return users who have completed face enrollment
      .map(user => ({
        ...user,
        faceDescriptors: user.face_descriptors ? JSON.parse(user.face_descriptors) : null,
        averageDescriptor: user.average_descriptor ? JSON.parse(user.average_descriptor) : null
      }));
  },

  getEmployeeByEmployeeId(employeeId) {
    const db = loadDB();
    const user = db.users.find(u => u.employee_id === employeeId);
    if (user) {
      user.faceDescriptors = user.face_descriptors ? JSON.parse(user.face_descriptors) : null;
      user.averageDescriptor = user.average_descriptor ? JSON.parse(user.average_descriptor) : null;
    }
    return user;
  },

  deleteEmployee(id) {
    const db = loadDB();
    db.users = db.users.filter(u => u.id !== id);
    saveDB(db);
  },

  // Session management
  createSession({ userId, token }) {
    const db = loadDB();
    
    // Remove any existing session for this user (single session per user)
    db.sessions = db.sessions.filter(s => s.userId !== userId);
    
    db.sessions.push({
      userId,
      token,
      createdAt: new Date().toISOString()
    });

    saveDB(db);
  },

  getSessionByToken(token) {
    const db = loadDB();
    const session = db.sessions.find(s => s.token === token);
    return session || null;
  },

  deleteSession(token) {
    const db = loadDB();
    db.sessions = db.sessions.filter(s => s.token !== token);
    saveDB(db);
  },

  deleteAllSessions(userId) {
    const db = loadDB();
    db.sessions = db.sessions.filter(s => s.userId !== userId);
    saveDB(db);
  },

  createAttendance({ userId, employeeId, type, location, proofPhoto }) {
    const db = loadDB();
    const id = db.attendance.length > 0 ? Math.max(...db.attendance.map(a => a.id)) + 1 : 1;

    db.attendance.push({
      id,
      user_id: userId,
      employee_id: employeeId,
      type,
      timestamp: new Date().toISOString(),
      location,
      proof_photo: proofPhoto
    });

    saveDB(db);
    return id;
  },

  getAttendanceRecords({ employeeId, startDate, endDate } = {}) {
    const db = loadDB();
    let records = db.attendance.map(record => {
      const user = db.users.find(u => u.id === record.user_id);
      return {
        ...record,
        name: user?.name || 'Unknown',
        employee_id: record.employee_id
      };
    });

    if (employeeId) {
      records = records.filter(r => r.employee_id === employeeId);
    }

    if (startDate) {
      records = records.filter(r => new Date(r.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      records = records.filter(r => new Date(r.timestamp) <= new Date(endDate));
    }

    return records.sort((a, b) => new Date(b.timestamp) - new Date(b.timestamp));
  }
};
