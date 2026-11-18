import mongoose from "mongoose";

export const connectDB = async (uri: string): Promise<void> => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // Make sure unique indexes (e.g. user email) exist before we accept traffic.
  await mongoose.connection.syncIndexes();
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
};
