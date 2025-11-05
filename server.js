import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import multer from "multer"
import { uploadFile } from "./utils/storage.js"
import path from "path"
const app = express();
dotenv.config();
app.use(cors());
const port = process.env.PORT || 9000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, `${file.originalname}-${uniqueSuffix}.pdf`)
    }
})

const upload = multer({ storage: storage })

app.post("/uploadpdf", upload.single("pdffile"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        console.log("Uploaded file info:", req.file);
        const filePath = path.join(process.cwd(), "uploads", req.file.filename);
        await uploadFile(req.file.filename, filePath);
        res.status(200).json({
            message: "File uploaded successfully!",
            filename: req.file.filename,
            path: `/uploads/${req.file.originalname}`,
            size: req.file.size,
            mimetype: req.file.mimetype,
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Error uploading file", error });
    }
})

app.get("/", (req, res) => {
    res.send("welcome to server");
})

app.listen(port, () => {
    console.log(`App running on ${port}`);
})