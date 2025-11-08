import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import multer from "multer"
import { uploadFile } from "./utils/storage.js"
import path from "path"
import chunkingqueue from "./utils/chunking-queue.js"
import memoryeventqueue from "./utils/memory-event-queue.js"
import { Pinecone } from "@pinecone-database/pinecone";
import connectDB from "./utils/mongodb.js";
import Chat from "./schema/chat.js"
import { v4 as uuidv4 } from "uuid";
const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());
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
connectDB();

app.post("/uploadpdf", upload.single("pdffile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    console.log("Uploaded file info:", req.file);
    const filePath = path.join(process.cwd(), "uploads", req.file.filename);
    //upload file into s3
    const uploadedfile = await uploadFile(req.file.filename, filePath);
    //send data in worker queue
    await chunkingqueue.add('file-ready', {
      id: uploadedfile.id,
      filepath: uploadedfile.path
    });

    res.status(200).json({
      id: uploadedfile.id,
      filepath: uploadedfile.path
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Error uploading file", error });
  }
})

app.get("/query", async (req, res) => {
  try {
    const { inp, id } = req.query;
    if (!inp || !id) {
      return res.status(400).json({ error: "Missing 'inp' or 'id' in query parameters" });
    }

    console.log(inp);
    console.log(id);

    const pc = new Pinecone({
      apiKey:
        process.env.PINECONE_API_KEY ||
        "pcsk_42HvDv_Foja9HwWfHJEWCor3PUvaSz2XtNzv2QHoCJpUWJK2yjLesp2FMdhsPaPUCiimcC",
    });

    const indexName = "pdf-uploaded";
    const namespace = `pdf-${id}`;
    const index = pc.index(indexName).namespace(namespace);

    console.log(`Searching namespace: ${namespace}`);

    const embedResponse = await pc.inference.embed(
      "llama-text-embed-v2",  // model as first parameter
      [inp],                   // inputs as second parameter
      { inputType: "passage" } // parameters as third parameter
    );

    const queryVector = embedResponse.data[0].values;

    const queryResponse = await index.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
      includeValues: false
    });

    console.log(`Found ${queryResponse.matches.length} matches`);

    await memoryeventqueue.add('memory-event', {
      query: inp,
      documentId: id,
      totalMatches: queryResponse.matches.length,
      matches: queryResponse.matches.map(match => ({
        id: match.id,
        score: match.score,
        text: match.metadata?.text || "",
        page: match.metadata?.page || null,
        ...match.metadata
      }))
    })

    res.json({
      query: inp,
      documentId: id,
      totalMatches: queryResponse.matches.length,
      matches: queryResponse.matches.map(match => ({
        id: match.id,
        score: match.score,
        text: match.metadata?.text || "",
        page: match.metadata?.page || null,
        ...match.metadata 
      }))
    });
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/newchat", async (req, res) => {
  try {
    const data = req.body;

    if (!data.name) {
      return res.status(400).json({ error: "Chat name is required" });
    }

    const chat = await Chat.create({
      userId: "123",
      projectId: uuidv4(),
      name: data.name,
      description: data.description || "",
    });

    console.log("Chat created:", chat);
    return res.status(200).json(chat);
  } catch (err) {
    console.error("Error creating chat:", err);
    return res.status(500).json({ error: "Failed to create chat" });
  }
});

app.get("/chats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

    if (chats.length === 0) {
      return res.status(404).json({ message: "No chats found for this user" });
    }

    return res.status(200).json(chats);
  } catch (err) {
    console.error("Error fetching user chats:", err);
    return res.status(500).json({ error: "Failed to fetch user chats" });
  }
});

app.put("/chat/:id", async (req, res) => {
  try {
    const { name, description } = req.body;
    const updatedChat = await Chat.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true }
    );

    if (!updatedChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    console.log("Chat updated:", updatedChat);
    return res.status(200).json(updatedChat);
  } catch (err) {
    console.error("Error updating chat:", err);
    return res.status(500).json({ error: "Failed to update chat" });
  }
});

app.delete("/chat/:id", async (req, res) => {
  try {
    const deletedChat = await Chat.findByIdAndDelete(req.params.id);
    if (!deletedChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    console.log("Chat deleted:", deletedChat._id);
    return res.status(200).json({ message: "Chat deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat:", err);
    return res.status(500).json({ error: "Failed to delete chat" });
  }
});

app.get("/", (req, res) => {
  res.send("welcome to server");
})

app.listen(port, () => {
  console.log(`App running on ${port}`);
})