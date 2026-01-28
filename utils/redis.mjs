import { createClient } from 'redis';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.connected = true;

    this.client.on('error', (err) => {
      console.error(err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      this.connected = true;
    });

    this.client.connect();
  }

  isAlive() {
    return this.connected;
  }

  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, duration) {
    await this.client.set(key, value, { EX: duration });
  }

  async del(key) {
    await this.client.del(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
