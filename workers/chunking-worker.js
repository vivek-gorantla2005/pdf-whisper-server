import { Worker } from "bullmq";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone } from "@pinecone-database/pinecone";

const worker = new Worker(
  "chunking-queue",
  async (job) => {
    console.log("Getting job data:", job.data);

    const assetPath = `uploads/${job.data.filepath}`;
    const loader = new PDFLoader(assetPath);
    const docs = await loader.load();

    let text = docs.map((d) => d.pageContent).join(" ");
    text = text.replace(/\n+/g, " ").trim();
    console.log("Extracted text length:", text.length);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 100,
    });
    const texts = await splitter.splitText(text);
    console.log("Total chunks:", texts.length);

    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "pcsk_42HvDv_Foja9HwWfHJEWCor3PUvaSz2XtNzv2QHoCJpUWJK2yjLesp2FMdhsPaPUCiimcC",
    });

    const indexName = "pdf-uploaded";
    const idx = await pc.listIndexes();
    const exists = idx.indexes?.some((i) => i.name === indexName);

    if (!exists) {
      console.log("Creating index...");
      await pc.createIndexForModel({
        name: indexName,
        cloud: "aws",
        region: "us-east-1",
        embed: {
          model: "llama-text-embed-v2",
          fieldMap: { text: "chunk_text" },
        },
        waitUntilReady: true,
      });
      console.log("Waiting extra 60s for model to become ready...");
      await new Promise((r) => setTimeout(r, 60000));
    } else {
      console.log("Index already exists.");
    }

    // Prepare valid records
    const records = texts
      .filter((t) => t && t.trim().length > 0)
      .map((t, i) => ({
        id: `${job.data.id}-${i}`,
        values: [],
        chunk_text: t, 
        metadata: job.data.filepath ,
      }));

    const index = pc.index(indexName).namespace(`pdf-${job.data.id}`);
    console.log("Uploading in batches...");

    //Batch upload in groups of 10
    const batchSize = 10;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(`Uploading batch ${i / batchSize + 1} / ${Math.ceil(records.length / batchSize)}...`);
      try {
        await index.upsertRecords(batch);
      } catch (err) {
        console.error("Error uploading batch:", err.message);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log("All batches uploaded successfully!");

    const stats = await index.describeIndexStats();
    console.log("Index stats:", JSON.stringify(stats, null, 2));
  },
  {
    connection: {
      host: "localhost",
      port: "6379",
    },
  }
);
