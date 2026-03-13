const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Generates a random uppercase enrolment code e.g. "XK4F9R"
function generateEnrolmentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Get all classes
// Teachers see their own classes with student counts.
// Admins see all classes.
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;

        const isAdmin = role === 'admin';

        const { rows } = await db.query(
            `SELECT
                 c.id,
                 c.name,
                 c.enrolment_code,
                 c.created_at,
                 c.teacher_id,
                 u.first_name AS teacher_first_name,
                 u.last_name  AS teacher_last_name,
                 COUNT(ce.id)::int AS student_count
             FROM classes c
             LEFT JOIN users           u  ON u.id  = c.teacher_id
             LEFT JOIN class_enrolments ce ON ce.class_id = c.id
             WHERE ($1 OR c.teacher_id = $2)
             GROUP BY c.id, u.first_name, u.last_name
             ORDER BY c.created_at DESC`,
            [isAdmin, userId]
        );

        res.json(rows);
    } catch (err) {
        console.error('GET /api/classes error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Creates a new class. Teachers only.
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { role, id: userId } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { name } = req.body;
        if (!name?.trim()) {
            return res.status(400).json({ message: 'Class name is required' });
        }

        // Generate a unique enrolment code — retry on collision
        let enrolmentCode;
        let attempts = 0;
        while (attempts < 10) {
            enrolmentCode = generateEnrolmentCode();
            const existing = await db.query(
                'SELECT id FROM classes WHERE enrolment_code = $1',
                [enrolmentCode]
            );
            if (existing.rows.length === 0) break;
            attempts++;
        }

        const { rows } = await db.query(
            `INSERT INTO classes (name, teacher_id, enrolment_code)
             VALUES ($1, $2, $3)
             RETURNING id, name, enrolment_code, created_at`,
            [name.trim(), userId, enrolmentCode]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('POST /api/classes error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/join', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
 
        if (role !== 'student') {
            return res.status(403).json({ message: 'Only students can join classes with a code.' });
        }
 
        const { code } = req.body;
        if (!code?.trim()) {
            return res.status(400).json({ message: 'Enrolment code is required.' });
        }
 
        // Find the class by enrolment code (case-insensitive)
        const classRes = await db.query(
            `SELECT id, name FROM classes WHERE UPPER(enrolment_code) = UPPER($1)`,
            [code.trim()]
        );
 
        if (classRes.rows.length === 0) {
            return res.status(404).json({ message: 'No class found with that code. Check with your teacher.' });
        }
 
        const cls = classRes.rows[0];
 
        // Enrol — silently succeed if already enrolled
        await db.query(
            `INSERT INTO class_enrolments (class_id, student_id)
             VALUES ($1, $2)
             ON CONFLICT (class_id, student_id) DO NOTHING`,
            [cls.id, userId]
        );
 
        res.status(201).json({
            message:    'Enrolled successfully',
            class_id:   cls.id,
            class_name: cls.name,
        });
    } catch (err) {
        console.error('POST /api/classes/join error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Returns a single class with its enrolled students.
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;

        // Fetch the class
        const classRes = await db.query(
            `SELECT c.id, c.name, c.enrolment_code, c.created_at, c.teacher_id
             FROM classes c WHERE c.id = $1`,
            [req.params.id]
        );

        if (classRes.rows.length === 0) {
            return res.status(404).json({ message: 'Class not found' });
        }

        const cls = classRes.rows[0];

        // Only the owning teacher or admin can view
        if (role !== 'admin' && cls.teacher_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Fetch enrolled students
        const studentsRes = await db.query(
            `SELECT u.id, u.first_name, u.last_name, u.email, ce.enrolled_at
             FROM users u
             JOIN class_enrolments ce ON ce.student_id = u.id
             WHERE ce.class_id = $1
             ORDER BY u.last_name, u.first_name`,
            [req.params.id]
        );

        res.json({ ...cls, students: studentsRes.rows });
    } catch (err) {
        console.error('GET /api/classes/:id error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Manually enrols a student by email. Teacher only.
router.post('/:id/students', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { email } = req.body;
        if (!email?.trim()) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Verify the teacher owns this class
        const classRes = await db.query(
            'SELECT id, teacher_id FROM classes WHERE id = $1',
            [req.params.id]
        );
        if (classRes.rows.length === 0) {
            return res.status(404).json({ message: 'Class not found' });
        }
        if (role !== 'admin' && classRes.rows[0].teacher_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Find the student by email
        const userRes = await db.query(
            `SELECT id, first_name, last_name, email, role
             FROM users WHERE email = $1`,
            [email.trim().toLowerCase()]
        );
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'No user found with that email address' });
        }

        const student = userRes.rows[0];
        if (student.role !== 'student') {
            return res.status(400).json({ message: 'That user is not a student' });
        }

        // Enrol — ignore if already enrolled
        await db.query(
            `INSERT INTO class_enrolments (class_id, student_id)
             VALUES ($1, $2)
             ON CONFLICT (class_id, student_id) DO NOTHING`,
            [req.params.id, student.id]
        );

        res.status(201).json({
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email,
        });
    } catch (err) {
        console.error('POST /api/classes/:id/students error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Removes a student from a class. Teacher only.
router.delete('/:id/students/:studentId', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Verify ownership
        const classRes = await db.query(
            'SELECT teacher_id FROM classes WHERE id = $1',
            [req.params.id]
        );
        if (classRes.rows.length === 0) {
            return res.status(404).json({ message: 'Class not found' });
        }
        if (role !== 'admin' && classRes.rows[0].teacher_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await db.query(
            `DELETE FROM class_enrolments
             WHERE class_id = $1 AND student_id = $2`,
            [req.params.id, req.params.studentId]
        );

        res.json({ message: 'Student removed from class' });
    } catch (err) {
        console.error('DELETE /api/classes/:id/students/:studentId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Deletes a class. Teacher only, must own it.
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const classRes = await db.query(
            'SELECT teacher_id FROM classes WHERE id = $1',
            [req.params.id]
        );
        if (classRes.rows.length === 0) {
            return res.status(404).json({ message: 'Class not found' });
        }
        if (role !== 'admin' && classRes.rows[0].teacher_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await db.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
        res.json({ message: 'Class deleted' });
    } catch (err) {
        console.error('DELETE /api/classes/:id error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;