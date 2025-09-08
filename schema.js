import { gql } from 'graphql-tag';

const typeDefs = gql`
  enum OrderByField {
    index
    timestamp
    blockNumber
  }

  enum OrderDirection {
    asc
    desc
  }
    
  type Deposit {
    index: Int
    timestamp: String
    blockNumber: Int
    commitment: String
    transactionHash: String
  }

  type Withdrawal {
    to: String
    fee: String
    nullifier: String
    timestamp: String
    blockNumber: Int
    transactionHash: String
  }

  type Relayer {
    address: String
    ensName: String
    ensHash: String
    blockRegistration: Int
  }

  type EncryptedNote {
    index: Int
    blockNumber: Int
    encryptedNote: String
    transactionHash: String
  }

  type NoteAccount {
    index: Int
    address: String
    encryptedAccount: String
  }

  type Meta {
    block: Block
  }

  type Block {
    number: Int
  }

  input WhereFilter {
    currency: String
    amount: String
    blockNumber_gte: Int
    blockRegistration_gte: Int
    address: String
  }

  type Delegation {
    delegator: String!
    block: Int!
    transactionHash: String!
  }


  type Query {
    deposits(first: Int, orderBy: OrderByField, orderDirection: OrderDirection, where: WhereFilter): [Deposit]
    withdrawals(first: Int, orderBy: OrderByField, orderDirection: OrderDirection, where: WhereFilter): [Withdrawal]
    relayers(first: Int, where: WhereFilter): [Relayer]
    encryptedNotes(first: Int, orderBy: OrderByField, orderDirection: OrderDirection, where: WhereFilter): [EncryptedNote]
    noteAccounts(where: WhereFilter): [NoteAccount]
    activeDelegators(where: WhereFilter): [Delegation]
    _meta: Meta
  }
`;

export default typeDefs;
