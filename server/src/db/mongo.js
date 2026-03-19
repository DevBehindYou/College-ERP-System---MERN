import mongoose from "mongoose";

export async function connectMongoOptional(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log("Mongo connected");
  } catch (err) {
    console.warn("Mongo not connected (optional for now):", err.message);
  }
}
