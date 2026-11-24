declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      MONGODB_URI?: string;
      SESSION_SECRET: string;
      JWT_SECRET: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      MAIL_SENDER: string;
      MAIL_PASSWORD: string;
      ARKESEL_API_KEY: string;
      ARKESEL_SENDER: string;
      ALGOLIA_APP_ID: string;
      ALGOLIA_ADMIN_API_KEY: string;
      ALGOLIA_INDEX_NAME: string;
      REDIS_HOST: string;
      REDIS_PORT: string;
      REDIS_PASSWORD: string;
      TRUST_PROXY?: string;
      MATCH_WORKER_CONCURRENCY?: string;
      MATCH_SWEEP_CRON?: string;
    }
  }
}

export {};
