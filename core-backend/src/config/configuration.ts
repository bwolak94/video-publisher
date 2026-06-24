export interface AppConfig {
  port: number;
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    publicKey: string;
    privateKey: string;
  };
}

export function configuration(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? "3001", 10),
    database: {
      url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/video_publisher",
    },
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    },
    jwt: {
      // In production these come from Vault/Secrets Manager
      publicKey: process.env.JWT_PUBLIC_KEY ?? "",
      privateKey: process.env.JWT_PRIVATE_KEY ?? "",
    },
  };
}
