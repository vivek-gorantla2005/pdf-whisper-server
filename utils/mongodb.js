import mongoose from "mongoose"

async function connectDB(){
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("connected to DB");
    }catch(err){
        console.error("error connection to mongoDB",err)
    }
}

export default connectDB;