const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
    }
});

// --- Middleware Setup ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
// --- Database Pool Setup ---
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Alumini_Student',
  password: '123456789', 
  port: 5433,
});

// --- Route Imports ---
const userRoutes = require('./userRoutes');
const messageRoutes = require('./messageRoutes')(io);

// --- API Routes ---
app.use('/users', userRoutes); 
app.use('/messages', messageRoutes); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
/**
 * @route   POST /register
 * @desc    Registers a new user
 */
app.post('/register', async (req, res) => {
  const { fullname, email, password, phone, role, studentData, alumniData } = req.body;

  if (!fullname || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Please fill out all required fields.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userExists = await client.query('SELECT * FROM user_table WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUserQuery = `
      INSERT INTO user_table (username, email, password_hash, role, phone_number)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING user_id
    `;
    const result = await client.query(newUserQuery, [fullname, email, hashedPassword, role, phone]);
    const userId = result.rows[0].user_id;

    if (role === 'student' && studentData) {
      const { roll_number, department_id, admission_year, graduation_year, current_semester } = studentData;
      await client.query(`
        INSERT INTO student_table (user_id, roll_number, department_id, admission_year, graduation_year, current_semester)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, roll_number, department_id, admission_year, graduation_year, current_semester]);
    } else if (role === 'alumni' && alumniData) {
      const { department_id, year_of_pass, current_job_title, company_name, location, linkedin_url, website_url } = alumniData;
      await client.query(`
        INSERT INTO alumini_table (user_id, department_id, year_of_pass, current_job_title, company_name, location, linkedin_url, website_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [userId, department_id, year_of_pass, current_job_title, company_name, location, linkedin_url, website_url]);
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Registration successful!', userId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  } finally {
    client.release();
  }
});

/**
 * @route   POST /login
 * @desc    Authenticates a user
 */
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }
    try {
        const result = await pool.query(`SELECT * FROM user_table WHERE email = $1`, [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
        }
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (isMatch) {
            res.status(200).json({ 
                success: true, 
                message: 'Login successful!',
                user_id: user.user_id,
                username: user.username,
                role: user.role 
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials. Please check your password.' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- Socket.io Connection Logic ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('join_chat', (userId) => {
        const roomName = `user_${userId}`;
        socket.join(roomName);
        console.log(`User with socket ID ${socket.id} joined room ${roomName}`);
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// ✅ ROUTE 2: Get all internships posted by a specific alumni (for alumni dashboard)
app.get("/api/internships/alumni/:alumniId", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT internship_id, title, company_name, location, duration, stipend, posted_date, status
       FROM internship_offer
       WHERE alumni_id = $1
       ORDER BY posted_date DESC`,
      [req.params.alumniId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching alumni internships:", err);
    res.status(500).json({ error: "Failed to load internships" });
  }
});

app.post("/api/internships", async (req, res) => {
  const {
    alumni_id,
    title,
    description,
    company_name,
    location,
    duration,
    stipend,
    deadline,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO internship_offer 
        (alumni_id, title, description, company_name, location, duration, stipend, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [alumni_id, title, description, company_name, location, duration, stipend, deadline]
    );

    res.status(201).json({
      message: "Internship posted successfully",
      internship: result.rows[0],
    });
  } catch (err) {
    console.error("Error posting internship:", err);
    res.status(500).json({ error: "Failed to post internship" });
  }
});

app.get("/api/internships", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
          i.internship_id AS id,
          i.title AS internshipName,
          i.description,
          i.company_name AS companyName,
          i.location,
          i.duration,
          i.stipend AS salary,
          i.posted_date AS postedDate,
          i.status,
          u.username AS granterName
      FROM internship_offer i
      JOIN alumini_table a ON i.alumni_id = a.alumni_id
      JOIN user_table u ON a.user_id = u.user_id
      WHERE i.status = 'Open'
      ORDER BY i.posted_date DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ SQL Query Error in /api/internships:", err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});


// ✅ ROUTE 4 (optional): Update application status — for alumni
app.put("/api/applications/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      "UPDATE internship_application SET application_status = $1 WHERE application_id = $2",
      [status, id]
    );
    res.json({ message: "Application status updated successfully" });
  } catch (err) {
    console.error("Error updating application status:", err);
    res.status(500).json({ error: "Failed to update application status" });
  }
});


// ✅ ROUTE 2: Apply for an internship
app.post("/api/internships/:id/apply", async (req, res) => {
  const internshipId = req.params.id;
  const { student_id, message } = req.body;

  try {
    // Prevent duplicate application
    const existing = await pool.query(
      `SELECT * FROM internship_application 
       WHERE internship_id = $1 AND student_id = $2`,
      [internshipId, student_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Already applied for this internship" });
    }

    // Insert new application
    await pool.query(
      `INSERT INTO internship_application (internship_id, student_id, message)
       VALUES ($1, $2, $3)`,
      [internshipId, student_id, message]
    );

    res.status(201).json({ message: "Application submitted successfully" });
  } catch (err) {
    console.error("Error applying:", err);
    res.status(500).json({ error: "Failed to apply for internship" });
  }
});

// ✅ ROUTE 3: Get all applications of a specific student
app.get("/api/applications/:studentId", async (req, res) => {
  const { studentId } = req.params;

  if (!studentId || studentId === "null" || studentId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing student ID" });
  }

  try {
    const result = await pool.query(
      `SELECT a.application_id, a.applied_date, a.application_status, 
              i.title AS internship_title, i.company_name
       FROM internship_application a
       JOIN internship_offer i ON a.internship_id = i.internship_id
       WHERE a.student_id = $1
       ORDER BY a.applied_date DESC`,
      [parseInt(studentId, 10)]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching applications:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




// --- Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

