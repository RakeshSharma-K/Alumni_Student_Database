import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new pg.Pool({
  user: "postgres",
  host: "localhost",
  database: "alumni_system",
  password: "yourpassword",
  port: 5432,
});

// ✅ ROUTE 1: Get all internships
app.get("/api/internships", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, a.name AS granter_name 
      FROM internship_offer i
      JOIN alumni a ON i.alumni_id = a.alumni_id
      WHERE i.status = 'Open'
      ORDER BY i.posted_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load internships" });
  }
});

// ✅ ROUTE 2: Apply for an internship
app.post("/api/internships/:id/apply", async (req, res) => {
  const internshipId = req.params.id;
  const { student_id, message } = req.body;

  try {
    // check duplicate
    const check = await pool.query(
      "SELECT * FROM internship_application WHERE internship_id=$1 AND student_id=$2",
      [internshipId, student_id]
    );
    if (check.rows.length > 0)
      return res.status(400).json({ message: "Already applied" });

    await pool.query(
      `INSERT INTO internship_application (internship_id, student_id, message)
       VALUES ($1, $2, $3)`,
      [internshipId, student_id, message]
    );

    res.status(201).json({ message: "Application submitted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply for internship" });
  }
});

// ✅ ROUTE 3: Get student’s applications
app.get("/api/applications/:studentId", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT ia.*, io.title, io.company_name, io.location, io.duration
      FROM internship_application ia
      JOIN internship_offer io ON ia.internship_id = io.internship_id
      WHERE ia.student_id = $1
      ORDER BY ia.applied_date DESC
      `,
      [req.params.studentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

// ✅ ROUTE 4 (optional): Update status (for alumni dashboard)
app.put("/api/applications/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      "UPDATE internship_application SET application_status=$1 WHERE application_id=$2",
      [status, id]
    );
    res.json({ message: "Application status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update application status" });
  }
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
