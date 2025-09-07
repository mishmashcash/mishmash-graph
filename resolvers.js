import logger from './logger.js';

const resolvers = {
  Query: {
    deposits: async (_, { first, orderBy = 'index', orderDirection = 'desc', where = {} }, { db }) => {
      try {
        return db.query('deposits', where, orderBy, orderDirection, first);
      } catch (error) {
        logger.error('Error in deposits resolver:', error);
        throw error;
      }
    },
    withdrawals: async (_, { first, orderBy = 'blockNumber', orderDirection = 'asc', where = {} }, { db }) => {
      try {
        return db.query('withdrawals', where, orderBy, orderDirection, first);
      } catch (error) {
        logger.error('Error in withdrawals resolver:', error);
        throw error;
      }
    },
    relayers: async (_, { first, where = {} }, { db }) => {
      try {
        return db.query('relayers', where, 'blockRegistration', 'asc', first);
      } catch (error) {
        logger.error('Error in relayers resolver:', error);
        throw error;
      }
    },
    encryptedNotes: async (_, { first, orderBy = 'blockNumber', orderDirection = 'asc', where = {} }, { db }) => {
      try {
        return db.query('encryptedNotes', where, orderBy, orderDirection, first);
      } catch (error) {
        logger.error('Error in encryptedNotes resolver:', error);
        throw error;
      }
    },
    noteAccounts: async (_, { where = {} }, { db }) => {
      try {
        return db.query('noteAccounts', where, 'index', 'asc');
      } catch (error) {
        logger.error('Error in noteAccounts resolver:', error);
        throw error;
      }
    },
    _meta: async (_, __, { db }) => {
      try {
        const number = await db.getLastBlock();
        return { block: { number } };
      } catch (error) {
        logger.error('Error in _meta resolver:', error);
        throw error;
      }
    },
  },
};

export default resolvers;
