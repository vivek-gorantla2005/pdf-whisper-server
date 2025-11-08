import { Worker } from "bullmq";
import { GoogleGenAI } from "@google/genai";
import { Server } from "socket.io";
import http from "http";

const ai = new GoogleGenAI({ apiKey: "AIzaSyDvgvsXxmcVPg600iLre3RK6A66TcJ4lsQ" });

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" },
});
server.listen(5050, () => console.log("Socket.IO running on :5050"));

const memoryWorker = new Worker(
  "memory-event-queue",
  async (job) => {
    try {
      const data = job.data.matches || [];
      let context = "";

      for (const match of data) {
        context += (match.chunk_text || match.text || "") + "\n\n";
      }

      console.log("Generating response...");

      const prompt = `
Context from PDF document:
${context}

Question: ${job.data.query}

Instructions:
- Answer based solely on the provided context.
- If the context doesn't contain enough information, say so clearly.
- Be accurate.
Answer:
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 8192,
        },
      });

      const answer = response.text;
      console.log("Response generated:", answer);

      io.emit("stream_complete", {
        query: job.data.query,
        answer
      });
      return {
        query: job.data.query,
        answer: response,
      };
    } catch (error) {
      console.error("Worker error:", error.message);
      throw error;
    }
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);

memoryWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

memoryWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

console.log("Memory worker ready");
