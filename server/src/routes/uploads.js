const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const router  = express.Router();
const { authenticateToken } = require("../middleware/auth");

// Set up multer for file uploads
// Files are first stored in uploads/temp/ on initial upload
// When a scenario is saved (POST /api/scenarios), files are moved into uploads/scenarios/:scenarioId/

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../../uploads/temp"));
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "_" + Math.random().toString(36).slice(2, 10);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    },
});

const upload = multer({ storage });

// POST /api/uploads - handle file upload
// return the temp file path for the frontend to store on the inject
// scenario save route is responsible for moving the file to the correct scenario folder

router.post("/", authenticateToken, upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
 
    res.json({
        file_path: `uploads/temp/${req.file.filename}`,
        original_name: req.file.originalname,
    });
});
 
// GET /api/uploads/scenarios/:scenarioId/:filename
// Serves scenario evidence files. Requires a valid JWT — replaces the old
// express.static('/uploads') in index.js which was publicly accessible.
// Path is validated to prevent directory traversal.
router.get("/scenarios/:scenarioId/:filename", authenticateToken, (req, res) => {
    const { scenarioId, filename } = req.params;

    // Block directory traversal attempts
    if (filename.includes("..") || filename.includes("/") || scenarioId.includes("..")) {
        return res.status(400).json({ message: "Invalid file path." });
    }

    const filePath = path.join(__dirname, "../../uploads/scenarios", scenarioId, filename);

    // Double-check the resolved path is still inside uploads/
    const uploadsRoot = path.resolve(path.join(__dirname, "../../uploads"));
    if (!path.resolve(filePath).startsWith(uploadsRoot)) {
        return res.status(400).json({ message: "Invalid file path." });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found." });
    }

    res.sendFile(filePath);
});

module.exports = router;