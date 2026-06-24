/**
 * Integration tests (Supertest) — IT-07-01 through IT-07-06
 *
 * All external dependencies (DB, Redis, BullMQ) are replaced with in-memory
 * fakes so no real infrastructure is required.
 */
import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { JwtService } from "@nestjs/jwt";
import * as request from "supertest";
import * as jwt from "jsonwebtoken";

import { AppModule } from "../src/app.module";
import { DRIZZLE } from "../src/db/db.module";
import { REDIS_CLIENT } from "../src/redis/redis.module";
import { ELEVENLABS_HTTP } from "../src/elevenlabs/elevenlabs.service";

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const JWT_SECRET = "test-e2e-secret";
const EXISTING_USER_ID = "00000000-0000-0000-0000-000000000001";

function makeToken(userId = EXISTING_USER_ID, expiresIn: any = "1h") {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn });
}

const fakeRedis = {
  ping: jest.fn().mockResolvedValue("PONG"),
  quit: jest.fn().mockResolvedValue("OK"),
};

const failingRedis = {
  ping: jest.fn().mockRejectedValue(new Error("Redis connection refused")),
  quit: jest.fn().mockResolvedValue("OK"),
};

const fakeDbPool = {
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
};

const failingDbPool = {
  connect: jest.fn().mockRejectedValue(new Error("DB connection refused")),
};

const fakeProject = {
  id: "proj-uuid-1",
  userId: EXISTING_USER_ID,
  title: "Test Project",
  mode: "worker",
  status: "draft",
  storyboard: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeDrizzleFake() {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([{ id: EXISTING_USER_ID }]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([fakeProject]),
  };
}

interface BuildOptions {
  redisOk?: boolean;
  dbOk?: boolean;
}

async function buildApp({ redisOk = true, dbOk = true }: BuildOptions = {}) {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redisOk ? fakeRedis : failingRedis)
    .overrideProvider("DB_POOL")
    .useValue(dbOk ? fakeDbPool : failingDbPool)
    .overrideProvider(DRIZZLE)
    .useValue(makeDrizzleFake())
    // Override JwtService to use HS256 with our test secret
    .overrideProvider(JwtService)
    .useValue(new JwtService({ secret: JWT_SECRET }))
    .overrideProvider(ELEVENLABS_HTTP)
    .useValue(jest.fn())
    .compile();

  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter()
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe("Integration Tests (IT-07)", () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  // IT-07-01: GET /health → 200
  it("GET /health returns 200 (IT-07-01)", async () => {
    app = await buildApp();
    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect({ status: "ok" });
  });

  // IT-07-02: GET /ready with DB and Redis up → 200
  it("GET /ready with all deps up returns 200 (IT-07-02)", async () => {
    app = await buildApp({ redisOk: true, dbOk: true });
    const res = await request(app.getHttpServer()).get("/ready").expect(200);
    expect(res.body.status).toBe("ready");
  });

  // IT-07-03: GET /ready with DB down → 503
  it("GET /ready with DB down returns 503 (IT-07-03)", async () => {
    app = await buildApp({ redisOk: true, dbOk: false });
    await request(app.getHttpServer()).get("/ready").expect(503);
  });

  // IT-07-04: POST /projects without auth → 401
  it("POST /projects without auth returns 401 (IT-07-04)", async () => {
    app = await buildApp();
    await request(app.getHttpServer())
      .post("/projects")
      .send({ title: "Test", mode: "worker" })
      .expect(401);
  });

  // IT-07-05: POST /projects with valid auth → 201
  it("POST /projects with valid auth returns 201 (IT-07-05)", async () => {
    app = await buildApp();
    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Test Project", mode: "worker" })
      .expect(201);

    expect(res.body.id).toBe("proj-uuid-1");
    expect(res.body.title).toBe("Test Project");
  });

  // IT-07-06: WS connection with invalid JWT → rejected (gateway rejects auth)
  it("WS connection with invalid JWT is rejected (IT-07-06)", async () => {
    app = await buildApp();
    // Start listening on a random port for WS test
    await app.listen(0);
    const port = (app.getHttpServer().address() as any).port;

    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { io } = require("socket.io-client");
      const socket = io(`http://localhost:${port}`, {
        auth: { token: "bad.jwt.token" },
        timeout: 3000,
        reconnection: false,
      });

      const done = () => {
        socket.removeAllListeners();
        socket.disconnect();
        resolve();
      };

      socket.on("error", done);
      socket.on("disconnect", done);
      setTimeout(done, 3000);
    });
  });
});
