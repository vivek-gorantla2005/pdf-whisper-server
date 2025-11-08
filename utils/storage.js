import { createClient } from '@supabase/supabase-js'
import fs from "fs"

const supabase = createClient("https://fpndnfsoawmfpgmubrcu.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbmRuZnNvYXdtZnBnbXVicmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMTcxMjgsImV4cCI6MjA3Nzg5MzEyOH0.MrptEu4rvHtCL-htcLsgddZ56jF5bRXAyBUcEgq73dM")

export async function uploadFile(filename, localPath) {
    try {
        const fileBuffer = fs.readFileSync(localPath);
        const { data, error } = await supabase.storage
            .from("pdf-uploads")
            .upload(filename, fileBuffer, {
                contentType: "application/pdf",
                upsert: true,
            });
        if (error) {
            console.error("Error uploading to Supabase:", error.message);
            return null;
        }
        console.log("File uploaded to Supabase:", data);
        return {
            id: crypto.randomUUID(),
            path: data.path,
        };
    } catch (err) {
        console.error("uploadFile failed:", err);
        return null;
    }
}