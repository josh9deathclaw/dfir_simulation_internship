const express = require("express");
const multer  = require("multer");
const path    = require("path");
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
 
module.exports = router;