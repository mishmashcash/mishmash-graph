import Datastore from '@seald-io/nedb';
import logger from './logger.js';
import fs from 'fs';
import { CHAINS } from './config.js';

class DB {

  constructor(chainName) {
    this.chain = chainName;
    const dir = `./data/${this.chain}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = {
      meta: new Datastore({ filename: `${dir}/meta.db`, autoload: true }),
      deposits: new Datastore({ filename: `${dir}/deposits.db`, autoload: true }),
      withdrawals: new Datastore({ filename: `${dir}/withdrawals.db`, autoload: true }),
      relayers: new Datastore({ filename: `${dir}/relayers.db`, autoload: true }),
      encryptedNotes: new Datastore({ filename: `${dir}/encryptedNotes.db`, autoload: true }),
      noteAccounts: new Datastore({ filename: `${dir}/noteAccounts.db`, autoload: true }),
      delegations: new Datastore({ filename: `${dir}/delegations.db`, autoload: true })
    };

    this.init();
  }

  async init() {
    try {
      // Ensure default meta
      const metaCount = await this.db.meta.countAsync({ key: 'last_block' });
      if (metaCount === 0) {
        await this.db.meta.insertAsync({ key: 'last_block', value: CHAINS[this.chain].FROM_BLOCK });
      }

      // Ensure indexes
      this.db.deposits.ensureIndex({ fieldName: 'blockNumber' });
      this.db.deposits.ensureIndex({ fieldName: 'currency' });
      this.db.deposits.ensureIndex({ fieldName: 'amount' });
      this.db.withdrawals.ensureIndex({ fieldName: 'blockNumber' });
      this.db.withdrawals.ensureIndex({ fieldName: 'currency' });
      this.db.withdrawals.ensureIndex({ fieldName: 'amount' });
      this.db.relayers.ensureIndex({ fieldName: 'blockRegistration' });
      this.db.encryptedNotes.ensureIndex({ fieldName: 'blockNumber' });
      this.db.noteAccounts.ensureIndex({ fieldName: 'address' });
      this.db.noteAccounts.ensureIndex({ fieldName: 'index' });
      this.db.delegations.ensureIndex({ fieldName: 'delegatee' });
      this.db.delegations.ensureIndex({ fieldName: 'delegator' });
      this.db.delegations.ensureIndex({ fieldName: 'block' });
    } catch (error) {
      logger.error('Error initializing DB:', error);
      throw error;
    }
  }

  async getLastBlock() {
    const doc = await this.db.meta.findOneAsync({ key: 'last_block' });
    return doc ? parseInt(doc.value) : CHAINS[this.chain].FROM_BLOCK;
  }

  async setLastBlock(block) {
    await this.db.meta.updateAsync(
      { key: 'last_block' },
      { $set: { value: block.toString() } },
      { upsert: true }
    );
  }

  async getMaxIndex(entity) {
    const doc = await this.db[entity].findAsync({}).sort({ index: -1 }).limit(1);
    return doc[0] ? doc[0].index : 0;
  }

  async getMaxNoteAccountIndex(address) {
    const doc = await this.db.noteAccounts.findAsync({ address }).sort({ index: -1 }).limit(1);
    return doc[0] ? doc[0].index : 0;
  }

  async insert(entity, data) {
    await this.db[entity].updateAsync(
      { id: data.id },
      data,
      { upsert: true }
    );
  }

  async query(entity, filters = {}, orderBy = 'blockNumber', orderDirection = 'asc', first = 1000, skip = 0) {
    const query = {};
    for (const [key, value] of Object.entries(filters)) {
      if (key.endsWith('_gte')) {
        const field = key.replace('_gte', '');
        query[field] = { $gte: value };
      } else {
        query[key] = value;
      }
    }

    let cursor = this.db[entity].find(query);
    if (orderBy) {
      cursor = cursor.sort({ [orderBy]: orderDirection === 'asc' ? 1 : -1 });
    }
    cursor = cursor.skip(skip).limit(first);
    return await cursor.execAsync();
  }
}

export default DB;
