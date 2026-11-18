import { env } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";
import { Teacher } from "./models/teacher.model";

// Inserts a couple of demo teachers (skips ones that already exist).
const run = async (): Promise<void> => {
  await connectDB(env.mongoUri);
  const teachers = [
    { fullName: "Anita Sharma", email: "anita.sharma@example.com", specialization: "Mathematics", experience: 8 },
    { fullName: "Rahul Verma", email: "rahul.verma@example.com", specialization: "Physics", experience: 5 },
  ];
  for (const t of teachers) {
    const doc = await Teacher.findOneAndUpdate({ email: t.email }, { $setOnInsert: t }, { upsert: true, new: true });
    console.log(`Teacher ready: ${doc.fullName} -> ${doc._id}`);
  }
  await disconnectDB();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
