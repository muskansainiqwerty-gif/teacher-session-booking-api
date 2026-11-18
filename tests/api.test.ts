import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app";
import { Session } from "../src/models/session.model";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://placeholder";

let mongod: MongoMemoryServer;
const app = createApp();
const HOUR = 3600 * 1000;
const future = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const ghostId = "64b7f0c2a1b2c3d4e5f60718";

const mkUser = async (email = `u${Math.random()}@x.com`) =>
  (await request(app).post("/users").send({ fullName: "Test User", email, phone: "+911234567890" })).body.data;
const mkTeacher = async () =>
  (await request(app).post("/teachers").send({ fullName: "Tea Cher", email: "t@x.com", specialization: "Math", experience: 5 })).body.data;
const mkSession = async (teacherId: string, startH: number, endH: number) =>
  request(app).post("/sessions").send({ teacherId, startTime: future(startH), endTime: future(endH) });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await mongoose.connection.syncIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
});

describe("POST /users", () => {
  it("creates a user and normalises email", async () => {
    const res = await request(app).post("/users").send({ fullName: "Jane", email: " Jane@X.COM ", phone: "9876543210" });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("jane@x.com");
  });
  it("rejects duplicate email (case-insensitive) with 409", async () => {
    await mkUser("a@x.com");
    const res = await request(app).post("/users").send({ fullName: "Other", email: "A@x.com", phone: "9876543210" });
    expect(res.status).toBe(409);
  });
  it("handles concurrent duplicates with 409 not 500", async () => {
    const body = { fullName: "Race", email: "race@x.com", phone: "9876543210" };
    const rs = await Promise.all([1, 2, 3, 4].map(() => request(app).post("/users").send(body)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
  });
  it.each([
    [{}],
    [{ fullName: "J", email: "a@x.com", phone: "9876543210" }],
    [{ fullName: "Jane", email: "not-an-email", phone: "9876543210" }],
    [{ fullName: "Jane", email: "a@x.com", phone: "abc" }],
    [{ fullName: 123, email: "a@x.com", phone: "9876543210" }],
  ])("rejects invalid body %j with 400", async (body) => {
    expect((await request(app).post("/users").send(body)).status).toBe(400);
  });
  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/users").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });
});

describe("POST /sessions", () => {
  it("creates an AVAILABLE session; ignores client-supplied status/userId", async () => {
    const t = await mkTeacher();
    const res = await request(app)
      .post("/sessions")
      .send({ teacherId: t._id, startTime: future(2), endTime: future(3), status: "COMPLETED", userId: ghostId });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("AVAILABLE");
    expect(res.body.data.userId).toBeNull();
  });
  it("404 for unknown teacher, 400 for malformed teacherId", async () => {
    expect((await mkSession(ghostId, 2, 3)).status).toBe(404);
    expect((await mkSession("xyz", 2, 3)).status).toBe(400);
  });
  it("400 when endTime <= startTime, invalid dates, or start in the past", async () => {
    const t = await mkTeacher();
    expect((await mkSession(t._id, 3, 2)).status).toBe(400);
    expect((await mkSession(t._id, 3, 3)).status).toBe(400);
    expect((await request(app).post("/sessions").send({ teacherId: t._id, startTime: "nope", endTime: future(3) })).status).toBe(400);
    expect((await request(app).post("/sessions").send({ teacherId: t._id, startTime: null, endTime: future(3) })).status).toBe(400);
    expect((await request(app).post("/sessions").send({ teacherId: t._id, startTime: future(-3), endTime: future(1) })).status).toBe(400);
  });
  it("409 on overlapping teacher session but allows back-to-back", async () => {
    const t = await mkTeacher();
    expect((await mkSession(t._id, 2, 4)).status).toBe(201);
    expect((await mkSession(t._id, 3, 5)).status).toBe(409);
    expect((await mkSession(t._id, 1, 3)).status).toBe(409);
    expect((await mkSession(t._id, 4, 5)).status).toBe(201);
  });
});

describe("GET /sessions/available", () => {
  it("returns only AVAILABLE sessions of that UTC day with teacher info, sorted", async () => {
    const t = await mkTeacher();
    const day = new Date(Date.UTC(2099, 5, 10));
    const at = (h: number) => new Date(day.getTime() + h * HOUR);
    await Session.insertMany([
      { teacherId: t._id, startTime: at(15), endTime: at(16) },
      { teacherId: t._id, startTime: at(9), endTime: at(10) },
      { teacherId: t._id, startTime: at(11), endTime: at(12), status: "BOOKED", userId: new mongoose.Types.ObjectId() },
      { teacherId: t._id, startTime: at(23.5), endTime: at(24.5) }, // starts on the day
      { teacherId: t._id, startTime: at(24), endTime: at(25) }, // next day, excluded
      { teacherId: t._id, startTime: at(-1), endTime: at(0) }, // previous day, excluded
    ]);
    const res = await request(app).get(`/sessions/available?dateTimestamp=${at(13).getTime()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
    const starts = res.body.data.sessions.map((s: any) => s.startTime);
    expect(starts).toEqual([at(9), at(15), at(23.5)].map((d) => d.toISOString()));
    expect(res.body.data.sessions[0].teacher.fullName).toBe("Tea Cher");
  });
  it("accepts a seconds timestamp and returns empty list for empty day", async () => {
    const res = await request(app).get(`/sessions/available?dateTimestamp=${Math.floor(Date.UTC(2099, 0, 1) / 1000)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toEqual([]);
  });
  it.each(["", "?dateTimestamp=", "?dateTimestamp=abc", "?dateTimestamp=1.5", "?dateTimestamp=99999999999999999999", "?dateTimestamp=1&dateTimestamp=2"])(
    "400 for bad query %s",
    async (q) => {
      expect((await request(app).get(`/sessions/available${q}`)).status).toBe(400);
    }
  );
});

describe("POST /sessions/:id/book", () => {
  it("books, then refuses a second booking (409), even by the same user", async () => {
    const t = await mkTeacher();
    const u1 = await mkUser();
    const u2 = await mkUser();
    const s = (await mkSession(t._id, 2, 3)).body.data;
    const ok = await request(app).post(`/sessions/${s._id}/book`).send({ userId: u1._id });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("BOOKED");
    expect(ok.body.data.userId).toBe(u1._id);
    expect((await request(app).post(`/sessions/${s._id}/book`).send({ userId: u2._id })).status).toBe(409);
    expect((await request(app).post(`/sessions/${s._id}/book`).send({ userId: u1._id })).status).toBe(409);
  });
  it("only one of many concurrent bookings wins", async () => {
    const t = await mkTeacher();
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => mkUser()));
    const s = (await mkSession(t._id, 2, 3)).body.data;
    const rs = await Promise.all(users.map((u) => request(app).post(`/sessions/${s._id}/book`).send({ userId: u._id })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
  });
  it("validates ids and existence", async () => {
    const t = await mkTeacher();
    const u = await mkUser();
    const s = (await mkSession(t._id, 2, 3)).body.data;
    expect((await request(app).post(`/sessions/${s._id}/book`).send({})).status).toBe(400);
    expect((await request(app).post(`/sessions/${s._id}/book`).send({ userId: "bad" })).status).toBe(400);
    expect((await request(app).post(`/sessions/bad/book`).send({ userId: u._id })).status).toBe(400);
    expect((await request(app).post(`/sessions/${s._id}/book`).send({ userId: ghostId })).status).toBe(404);
    expect((await request(app).post(`/sessions/${ghostId}/book`).send({ userId: u._id })).status).toBe(404);
    expect((await Session.findById(s._id))!.status).toBe("AVAILABLE");
  });
  it("refuses sessions that already started and user time clashes", async () => {
    const t = await mkTeacher();
    const u = await mkUser();
    const past = await Session.create({ teacherId: t._id, startTime: new Date(Date.now() - HOUR), endTime: new Date(Date.now() + HOUR) });
    expect((await request(app).post(`/sessions/${past._id}/book`).send({ userId: u._id })).status).toBe(409);

    const t2 = await request(app).post("/teachers").send({ fullName: "Other T", email: "o@x.com", specialization: "Art", experience: 1 });
    const a = (await mkSession(t._id, 5, 7)).body.data;
    const b = (await request(app).post("/sessions").send({ teacherId: t2.body.data._id, startTime: future(6), endTime: future(8) })).body.data;
    expect((await request(app).post(`/sessions/${a._id}/book`).send({ userId: u._id })).status).toBe(200);
    expect((await request(app).post(`/sessions/${b._id}/book`).send({ userId: u._id })).status).toBe(409);
  });
});

describe("PATCH /sessions/:id/complete", () => {
  it("completes a BOOKED session once only", async () => {
    const t = await mkTeacher();
    const u = await mkUser();
    const s = (await mkSession(t._id, 2, 3)).body.data;
    expect((await request(app).patch(`/sessions/${s._id}/complete`)).status).toBe(409); // AVAILABLE
    await request(app).post(`/sessions/${s._id}/book`).send({ userId: u._id });
    const res = await request(app).patch(`/sessions/${s._id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("COMPLETED");
    expect(res.body.data.completedAt).toBeTruthy();
    expect((await request(app).patch(`/sessions/${s._id}/complete`)).status).toBe(409);
  });
  it("404 / 400 for missing or malformed id", async () => {
    expect((await request(app).patch(`/sessions/${ghostId}/complete`)).status).toBe(404);
    expect((await request(app).patch(`/sessions/nope/complete`)).status).toBe(400);
  });
});

describe("GET /users/:id/sessions", () => {
  it("splits sessions into upcoming and completed, only for that user", async () => {
    const t = await mkTeacher();
    const u = await mkUser();
    const other = await mkUser();
    const [s1, s2, s3, s4] = await Promise.all([mkSession(t._id, 2, 3), mkSession(t._id, 4, 5), mkSession(t._id, 6, 7), mkSession(t._id, 8, 9)]).then((r) => r.map((x) => x.body.data));
    await request(app).post(`/sessions/${s2._id}/book`).send({ userId: u._id });
    await request(app).post(`/sessions/${s1._id}/book`).send({ userId: u._id });
    await request(app).post(`/sessions/${s3._id}/book`).send({ userId: u._id });
    await request(app).post(`/sessions/${s4._id}/book`).send({ userId: other._id });
    await request(app).patch(`/sessions/${s3._id}/complete`);

    const res = await request(app).get(`/users/${u._id}/sessions`);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingSessions.map((s: any) => s._id)).toEqual([s1._id, s2._id]);
    expect(res.body.data.completedSessions.map((s: any) => s._id)).toEqual([s3._id]);
    expect(res.body.data.upcomingSessions[0].teacher.specialization).toBe("Math");
  });
  it("returns empty arrays for a user with no sessions; 404/400 for bad users", async () => {
    const u = await mkUser();
    const res = await request(app).get(`/users/${u._id}/sessions`);
    expect(res.body.data).toEqual({ upcomingSessions: [], completedSessions: [] });
    expect((await request(app).get(`/users/${ghostId}/sessions`)).status).toBe(404);
    expect((await request(app).get(`/users/bad/sessions`)).status).toBe(400);
  });
});

describe("misc", () => {
  it("404 for unknown routes in the JSON error shape", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
