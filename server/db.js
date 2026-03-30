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
  return { users: [], attendance: [] };
}

function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

module.exports = {
  createUser({ name, email, employeeId, faceDescriptors, averageDescriptor }) {
    const db = loadDB();
    const id = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1;
    
    db.users.push({
      id,
      name,
      email,
      employee_id: employeeId,
      face_descriptors: JSON.stringify(faceDescriptors), // Store all descriptors
      average_descriptor: JSON.stringify(averageDescriptor), // Store average for quick matching
      created_at: new Date().toISOString()
    });
    
    saveDB(db);
    return id;
  },

  getAllEmployees() {
    const db = loadDB();
    return db.users.map(user => ({
      ...user,
      faceDescriptors: JSON.parse(user.face_descriptors),
      averageDescriptor: JSON.parse(user.average_descriptor)
    }));
  },

  getEmployeeById(id) {
    const db = loadDB();
    const user = db.users.find(u => u.id === id);
    if (user) {
      user.faceDescriptors = JSON.parse(user.face_descriptors);
      user.averageDescriptor = JSON.parse(user.average_descriptor);
    }
    return user;
  },

  getEmployeeByEmployeeId(employeeId) {
    const db = loadDB();
    const user = db.users.find(u => u.employee_id === employeeId);
    if (user) {
      user.faceDescriptors = JSON.parse(user.face_descriptors);
      user.averageDescriptor = JSON.parse(user.average_descriptor);
    }
    return user;
  },

  deleteEmployee(id) {
    const db = loadDB();
    db.users = db.users.filter(u => u.id !== id);
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

    return records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
};
